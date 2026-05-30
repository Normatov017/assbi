from datetime import datetime, timedelta
import sqlite3
from config import DB_PATH
def apply_retention_policy(days):
    cutoff=(datetime.now()-timedelta(days=int(days))).strftime('%Y-%m-%d %H:%M:%S')
    conn=sqlite3.connect(DB_PATH); cur=conn.cursor(); cur.execute('DELETE FROM minute_analytics WHERE timestamp < ?', (cutoff,)); cur.execute('DELETE FROM incidents WHERE timestamp < ?', (cutoff,)); conn.commit(); conn.close(); return cutoff
