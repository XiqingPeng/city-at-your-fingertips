# A City at Your Fingertips

一个手势驱动的实时 3D 城市小样。用摄像头追踪双手，观察建筑生长、城市密度和森林比例的平滑变化；也可以先用滑块操作。

## Windows 启动

双击本目录的 `启动城市Demo.cmd`，保持打开的命令窗口运行，然后在浏览器访问 http://localhost:8000。如果浏览器打开时服务尚未就绪，稍等几秒刷新页面。也可以在本目录打开 PowerShell，运行：

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

在 Chrome 或 Edge 打开 http://localhost:8000，点击「开启摄像头」并允许访问。按 Ctrl+C 关闭服务。首次加载需要联网下载 Three.js、MediaPipe 的 JavaScript / WASM 和手部模型；当前版本没有离线资源。视频在浏览器本机处理，不上传到项目服务器。

- 双手拉开或靠近：放大或缩小视角；双手一起上下左右移动：平移画面。城市密度使用滑块调整。
- 单手张开向上推动：建筑逐渐升高，向下回摆不会抵消生长。
- 捏合拇指和食指向下移动：降低建筑；保持捏合不动：森林逐渐恢复为城市。
- 张手左右挥动：森林逐渐生长。也可以用滑块直接调整。
- 鼠标拖动：旋转视角；滑轮：缩放。追踪丢失时保持最近值。
- 手势范围是初始实验值，需要按摄像头位置、光照和体验反馈调整。

## 技术与后续

Three.js 通过 WebGL 绘制程序生成的几何城市；MediaPipe Hand Landmarker 提取手部关键点，优先尝试 GPU，失败后尝试 CPU。浏览器和系统决定使用哪张 GPU，不能仅凭显卡型号保证调用独显。手势到画面的映射是连续规则与平滑插值，目前**没有 Transformer**。后续可先采集经参与者同意的关键点时间序列，再评估时序 Transformer 对更复杂手势的帮助和延迟；不需要保存摄像头画面。

当前素材库包含八种自制程序化建筑轮廓和八种树形，地图为 42×42；没有包含第三方 3D 模型。未来引入模型前应核对许可证、署名要求、文件大小与可修改性，并保留来源记录。优化方向包括相机标定、手势滤波、森林向城市的自然逆转、资产替换和离线依赖。

参考：[MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)、[Three.js 安装](https://threejs.org/manual/pages/installation.html)。
