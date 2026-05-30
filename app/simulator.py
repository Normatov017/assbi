import argparse, random
from datetime import datetime, timedelta
from database import init_db, insert_minute_analytics, insert_incident

def main():
    p=argparse.ArgumentParser(); p.add_argument('--days', type=int, default=30); p.add_argument('--camera-id', default='sim_cam_01'); p.add_argument('--site', default='Simulation Campus'); args=p.parse_args(); init_db()
    start=datetime.now()-timedelta(days=args.days); total=0
    for d in range(args.days):
        for hour in range(24):
            for minute in range(0,60,5):
                dt=start+timedelta(days=d,hours=hour,minutes=minute); rush=3 if 8<=hour<=10 or 17<=hour<=19 else 2 if 12<=hour<=14 else 1
                active=max(0,int(random.gauss(4*rush,2))); new=max(0,int(random.gauss(active/2,1))); total += new; standing=random.randint(0,active); sitting=max(0,active-standing); risk=min(100,active*4+random.randint(0,12)); level='LOW' if active<=5 else 'MEDIUM' if active<=15 else 'HIGH'
                row={'timestamp':dt.strftime('%Y-%m-%d %H:%M:%S'),'date':dt.strftime('%Y-%m-%d'),'hour':dt.hour,'minute':dt.minute,'camera_id':args.camera_id,'site':args.site,'active_people':active,'new_unique_people':new,'total_unique_people':total,'vehicle_count':random.randint(0,5),'object_count':random.randint(0,5),'left_zone':random.randint(0,active),'center_zone':random.randint(0,active),'right_zone':random.randint(0,active),'standing_count':standing,'sitting_count':sitting,'crowd_level':level,'risk_score':risk,'fps':round(random.uniform(10,28),2),'data_quality_score':round(random.uniform(80,100),2)}
                insert_minute_analytics(row)
                if risk>=80 or level=='HIGH': insert_incident(row['timestamp'],args.camera_id,args.site,'Simulated Crowd Risk','HIGH',f'Simulated event: active={active}, risk={risk}')
    print(f'Simulation completed for {args.days} days.')
if __name__ == '__main__': main()
