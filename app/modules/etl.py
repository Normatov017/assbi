from datetime import datetime
import sqlite3, pandas as pd
from config import DB_PATH, REPORT_DIR
def run_etl_export():
    conn=sqlite3.connect(DB_PATH); df=pd.read_sql_query('SELECT * FROM minute_analytics', conn); conn.close()
    ts=datetime.now().strftime('%Y%m%d_%H%M%S'); csv=REPORT_DIR/f'minute_analytics_{ts}.csv'; xlsx=REPORT_DIR/f'minute_analytics_{ts}.xlsx'
    df.to_csv(csv, index=False); df.to_excel(xlsx, index=False)
    return {'rows': len(df), 'csv': str(csv), 'xlsx': str(xlsx)}
