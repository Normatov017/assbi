from datetime import datetime
import sqlite3, pandas as pd
from config import DB_PATH, REPORT_DIR
def generate_html_report():
    conn=sqlite3.connect(DB_PATH); df=pd.read_sql_query('SELECT * FROM minute_analytics', conn); inc=pd.read_sql_query('SELECT * FROM incidents', conn); conn.close()
    path=REPORT_DIR / f"assbi_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
    html='<h1>ASSBI Ultra BI Report</h1>'
    html += f"<p>Rows: {len(df)} | Incidents: {len(inc)}</p>"
    if not df.empty: html += df.tail(20).to_html(index=False)
    path.write_text(html, encoding='utf-8'); return path
