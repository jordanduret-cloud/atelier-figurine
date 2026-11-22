import sys, json, numpy as np
from PIL import Image
SCR = sys.argv[1]
prefix = sys.argv[2] if len(sys.argv) > 2 else 'mesh'
pos = np.fromfile(f'{SCR}/{prefix}_pos.f32', dtype=np.float32).reshape(-1,3)
col = np.fromfile(f'{SCR}/{prefix}_col.u8', dtype=np.uint8).reshape(-1,3).astype(np.float32)
nrm = np.fromfile(f'{SCR}/{prefix}_nrm.f32', dtype=np.float32).reshape(-1,3)
H = 560; W = 460
def render(yaw_deg, pitch_deg=12):
    a = np.radians(yaw_deg); b = np.radians(pitch_deg)
    # rotate about Y by yaw then about X by pitch
    Ry = np.array([[np.cos(a),0,np.sin(a)],[0,1,0],[-np.sin(a),0,np.cos(a)]])
    Rx = np.array([[1,0,0],[0,np.cos(b),-np.sin(b)],[0,np.sin(b),np.cos(b)]])
    R = Rx @ Ry
    p = pos @ R.T; n = nrm @ R.T
    h = pos[:,1].max()
    scale = (H*0.88)/h
    sx = (p[:,0]*scale + W/2).astype(int)
    sy = (H*0.94 - p[:,1]*scale).astype(int)
    z = p[:,2]
    light = np.array([0.35,0.55,0.75]); light/=np.linalg.norm(light)
    shade = np.clip(n @ light, 0, 1)*0.6 + 0.55
    img = np.full((H,W,3), 235, np.uint8)
    zb = np.full((H,W), -1e9, np.float32)
    order = np.argsort(z)
    for dy in (-1,0,1):
        for dx in (-1,0,1):
            xx = np.clip(sx+dx,0,W-1); yy = np.clip(sy+dy,0,H-1)
            for i in order:  # painter
                pass
            break
        break
    # z-buffer splat using numpy: sort ascending, later writes win
    for dy in (-1,0,1):
        for dx in (-1,0,1):
            xx = np.clip(sx+dx,0,W-1); yy = np.clip(sy+dy,0,H-1)
            img[yy[order], xx[order]] = np.clip(col[order]*shade[order,None],0,255).astype(np.uint8)
    return img
views = [0, 90, 180, 270]
tiles = [render(v) for v in views]
Image.fromarray(np.concatenate(tiles, axis=1)).save(f'{SCR}/{prefix}_render.png')
# sheet
meta = json.load(open(f'{SCR}/sheet.json'))
sh = np.fromfile(f'{SCR}/sheet.rgba', dtype=np.uint8).reshape(meta['h'], meta['w'], 4)
Image.fromarray(sh[:,:,:3]).save(f'{SCR}/sheet.png')
print('ok')
