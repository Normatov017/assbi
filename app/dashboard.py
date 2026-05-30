import sqlite3
from pathlib import Path
import numpy as np, pandas as pd, streamlit as st, plotly.express as px
from sklearn.linear_model import LinearRegression
from config import DB_PATH, REPORT_DIR
from database import init_db, get_thresholds, update_threshold, audit
from modules.auth import login, has_permission
from modules.etl import run_etl_export
from modules.reporting import generate_html_report
from modules.retention import apply_retention_policy
from modules.advanced_ai import explainable_ai_summary
init_db(); st.set_page_config(page_title='ASSBI Ultra Dashboard', page_icon='🛰️', layout='wide')
if 'user' not in st.session_state: st.session_state.user=None
if st.session_state.user is None:
    st.title('🔐 ASSBI Ultra Login'); u=st.text_input('Username'); p=st.text_input('Password', type='password')
    if st.button('Login'):
        user=login(u,p)
        if user: st.session_state.user=user; audit(u,'LOGIN','User logged in'); st.rerun()
        else: st.error('Invalid username or password')
    st.info('Demo: admin/admin123, analyst/analyst123, viewer/viewer123'); st.stop()
user=st.session_state.user; st.sidebar.success(f"{user['username']} ({user['role']})")
if st.sidebar.button('Logout'): audit(user['username'],'LOGOUT','User logged out'); st.session_state.user=None; st.rerun()
@st.cache_data(ttl=3)
def load_table(name):
    if not Path(DB_PATH).exists(): return pd.DataFrame()
    conn=sqlite3.connect(DB_PATH)
    try: return pd.read_sql_query(f'SELECT * FROM {name}', conn)
    except Exception: return pd.DataFrame()
    finally: conn.close()
analytics=load_table('minute_analytics'); incidents=load_table('incidents'); audit_df=load_table('audit_log')
st.title('🛰️ ASSBI Ultra Smart Surveillance & BI Dashboard')
if analytics.empty: st.warning('No data yet. Run detector or simulator first.'); st.code('python app/simulator.py --days 30'); st.stop()
analytics['timestamp']=pd.to_datetime(analytics['timestamp']); analytics['date']=pd.to_datetime(analytics['date']).dt.date; analytics=analytics.sort_values('timestamp')
sites=sorted(analytics['site'].unique()); cameras=sorted(analytics['camera_id'].unique())
ss=st.sidebar.multiselect('Sites', sites, default=sites); cc=st.sidebar.multiselect('Cameras', cameras, default=cameras); dr=st.sidebar.date_input('Date range', value=(analytics['date'].min(), analytics['date'].max()), min_value=analytics['date'].min(), max_value=analytics['date'].max())
f=analytics[analytics['site'].isin(ss) & analytics['camera_id'].isin(cc)]
if isinstance(dr, tuple) and len(dr)==2: f=f[(f['date']>=dr[0]) & (f['date']<=dr[1])]
if f.empty: st.warning('No data for selected filters.'); st.stop()
latest=f.iloc[-1]; c1,c2,c3,c4,c5,c6=st.columns(6); c1.metric('Active', int(latest['active_people'])); c2.metric('New Unique', int(f['new_unique_people'].sum())); c3.metric('Peak Active', int(f['active_people'].max())); c4.metric('Risk', f"{int(latest['risk_score'])}%"); c5.metric('Quality', f"{round(f['data_quality_score'].mean(),1)}%"); c6.metric('Incidents', len(incidents))
tabs=st.tabs(['Overview','Posture','Heatmap','Forecast','Incidents','Reports','Thresholds','Compliance','Audit'])
with tabs[0]:
    leader=f.groupby(['site','camera_id'], as_index=False).agg({'active_people':'mean','new_unique_people':'sum','risk_score':'mean','data_quality_score':'mean'}).sort_values('risk_score', ascending=False); st.dataframe(leader, use_container_width=True)
    st.plotly_chart(px.area(f,x='timestamp',y='active_people',color='camera_id',title='Active People Trend'), use_container_width=True); st.plotly_chart(px.line(f,x='timestamp',y='risk_score',color='camera_id',title='Risk Score Trend'), use_container_width=True)
    st.info(explainable_ai_summary({'active_people':int(latest['active_people']),'zone_peak':int(max(latest['left_zone'],latest['center_zone'],latest['right_zone'])),'risk_score':int(latest['risk_score'])}))
with tabs[1]:
    st.line_chart(f[['timestamp','standing_count','sitting_count']].set_index('timestamp')); st.plotly_chart(px.pie(pd.DataFrame({'Posture':['Standing','Sitting'], 'Count':[int(f['standing_count'].sum()), int(f['sitting_count'].sum())]}), names='Posture', values='Count', title='Posture Distribution'), use_container_width=True)
with tabs[2]:
    z=pd.DataFrame({'Zone':['Left','Center','Right'],'Occupancy':[int(f['left_zone'].sum()),int(f['center_zone'].sum()),int(f['right_zone'].sum())]}); st.plotly_chart(px.bar(z,x='Zone',y='Occupancy',title='Zone Occupancy'), use_container_width=True)
    heat=f.copy(); heat['weekday']=pd.to_datetime(heat['timestamp']).dt.day_name(); pivot=heat.pivot_table(index='weekday', columns='hour', values='active_people', aggfunc='mean', fill_value=0); st.plotly_chart(px.imshow(pivot, aspect='auto', title='Day/Hour Crowd Heatmap'), use_container_width=True)
with tabs[3]:
    df=f.copy().reset_index(drop=True); df['t']=np.arange(len(df))
    if len(df)>=5:
        m=LinearRegression(); m.fit(df[['t']], df['active_people']); ft=np.arange(len(df), len(df)+24); pred=m.predict(ft.reshape(-1,1)); times=pd.date_range(df['timestamp'].max(), periods=25, freq='5min')[1:]; st.plotly_chart(px.line(pd.DataFrame({'timestamp':times,'predicted_active_people':np.maximum(pred,0)}), x='timestamp', y='predicted_active_people', title='Predicted Crowd Trend'), use_container_width=True)
    else: st.warning('Need more data.')
with tabs[4]:
    if incidents.empty: st.success('No incidents.')
    else:
        incidents['timestamp']=pd.to_datetime(incidents['timestamp']); st.dataframe(incidents.sort_values('timestamp', ascending=False), use_container_width=True); freq=incidents.groupby(['incident_type','severity'], as_index=False).size(); st.plotly_chart(px.bar(freq,x='incident_type',y='size',color='severity',title='Incident Frequency'), use_container_width=True)
with tabs[5]:
    if has_permission(user,'export'):
        st.download_button('Download filtered CSV', f.to_csv(index=False), 'assbi_filtered.csv', 'text/csv')
        if st.button('Run ETL Export'): st.success(str(run_etl_export()))
        if st.button('Generate HTML BI Report'): st.success(f'Report generated: {generate_html_report()}')
        cost=st.number_input('Manual monitoring cost/hour', value=5.0); hours=st.number_input('Monitoring hours/month', value=720); saving=st.slider('Automation saving %',0,100,40); st.metric('Estimated monthly saving', f'${cost*hours*saving/100:,.2f}')
    else: st.warning('No export permission.')
with tabs[6]:
    th=get_thresholds()
    if has_permission(user,'edit_thresholds'):
        for k,v in th.items():
            nv=st.number_input(k, value=float(v));
            if st.button(f'Save {k}'): update_threshold(k,nv); st.success(f'{k} updated')
    else: st.dataframe(pd.DataFrame([th]))
with tabs[7]:
    st.markdown('- RBAC\n- Audit logs\n- No screenshots by default\n- Optional blur\n- Retention policy\n- Data quality scoring')
    if has_permission(user,'compliance'):
        days=st.number_input('Retention days', value=int(get_thresholds()['data_retention_days']))
        if st.button('Apply retention'): st.success(f'Cutoff: {apply_retention_policy(days)}')
with tabs[8]:
    if has_permission(user,'audit'): st.dataframe(audit_df.sort_values('id', ascending=False), use_container_width=True)
    else: st.warning('No audit permission.')
