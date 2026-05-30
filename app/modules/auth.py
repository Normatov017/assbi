USERS={"admin":{"password":"admin123","role":"Admin"},"analyst":{"password":"analyst123","role":"Analyst"},"viewer":{"password":"viewer123","role":"Viewer"}}
ROLE_PERMISSIONS={"Admin":["view","edit_thresholds","export","audit","compliance"],"Analyst":["view","export","compliance"],"Viewer":["view"]}
def login(username,password):
    u=USERS.get(username)
    if not u or u['password'] != password: return None
    return {"username": username, "role": u['role'], "permissions": ROLE_PERMISSIONS[u['role']]}
def has_permission(user, permission): return user and permission in user.get('permissions', [])
