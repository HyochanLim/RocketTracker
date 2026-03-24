import json
import os
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import Axes3D
from matplotlib.animation import FuncAnimation
import numpy as np

# 보정된 위치 데이터가 저장된 JSON 파일 경로
json_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'data', 'filtereddata', 'filtered_data.json')

with open(json_path, 'r', encoding='utf-8') as f:
	filtered_data = json.load(f)

# 위치 데이터만 추출 (예: 'position_world' 키가 있다고 가정)
pos_list = []
for row in filtered_data:
	pos = row.get('position_world')
	if pos and isinstance(pos, list) and len(pos) == 3:
		pos_list.append(pos)

if not pos_list:
	print('위치 데이터가 없습니다. (position_world 키를 확인하세요)')
	exit(1)

xs, ys, zs = np.array(pos_list).T

fig = plt.figure()
ax = fig.add_subplot(111, projection='3d')

# z축 중심 회전만 허용하는 함수
def on_move(event):
	if event.button == 1 and event.inaxes == ax:
		# 마우스 드래그로 z축(azim)만 회전
		ax.view_init(elev=ax.elev, azim=ax.azim + event.xdata - on_move.last_x if hasattr(on_move, 'last_x') else ax.azim)
		on_move.last_x = event.xdata
		fig.canvas.draw_idle()
def on_release(event):
	if hasattr(on_move, 'last_x'):
		del on_move.last_x
fig.canvas.mpl_connect('motion_notify_event', on_move)
fig.canvas.mpl_connect('button_release_event', on_release)

# 애니메이션 초기화
line, = ax.plot([], [], [], color='b', linewidth=1, marker='o', markersize=2)
ax.set_xlabel('X')
ax.set_ylabel('Y')
ax.set_zlabel('Z')
ax.set_title('3D 위치 궤적 (애니메이션)')
ax.set_xlim(np.min(xs), np.max(xs))
ax.set_ylim(np.min(ys), np.max(ys))
ax.set_zlim(np.min(zs), np.max(zs))

def init():
	line.set_data([], [])
	line.set_3d_properties([])
	return line,

def update(frame):
	idx = frame * 5  # 5개씩 점프해서 빠르게
	if idx > len(xs):
		idx = len(xs)
	line.set_data(xs[:idx], ys[:idx])
	line.set_3d_properties(zs[:idx])
	return line,

total_frames = (len(xs) + 4) // 5  # 5개씩 점프
ani = FuncAnimation(fig, update, frames=total_frames, init_func=init, blit=True, interval=10, repeat=False)
plt.show()