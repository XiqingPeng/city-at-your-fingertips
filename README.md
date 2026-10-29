# A City at Your Fingertips

一个手势驱动的实时 3D 城市小样。用摄像头追踪双手，观察建筑生长、城市密度和森林比例的平滑变化；也可以先用滑块操作。

## Windows 启动

在本目录打开 PowerShell，运行：

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

在 Chrome 或 Edge 打开 http://localhost:8000，点击「开启摄像头」并允许访问。按 Ctrl+C 关闭服务。首次加载需要联网下载 Three.js、MediaPipe 的 JavaScript / WASM 和手部模型；当前版本没有离线资源。视频在浏览器本机处理，不上传到项目服务器。

- 双手靠近：增加密度；抬高手：增加高度。
- 左右挥手：逐渐增加森林比例；滑块可反向调整森林比例。
- 鼠标拖动：旋转视角；滑轮：缩放。追踪丢失时保持最近值。
- 手势范围是初始实验值，需要按摄像头位置、光照和体验反馈调整。

## 技术与后续

Three.js 通过 WebGL 绘制程序生成的几何城市；MediaPipe Hand Landmarker 提取手部关键点，优先尝试 GPU，失败后尝试 CPU。浏览器和系统决定使用哪张 GPU，不能仅凭显卡型号保证调用独显。手势到画面的映射是连续规则与平滑插值，目前**没有 Transformer**。后续可先采集经参与者同意的关键点时间序列，再评估时序 Transformer 对更复杂手势的帮助和延迟；不需要保存摄像头画面。

当前建筑和树为自制简单几何体，没有包含第三方 3D 模型。未来引入模型前应核对许可证、署名要求、文件大小与可修改性，并保留来源记录。优化方向包括相机标定、手势滤波、森林向城市的自然逆转、资产替换和离线依赖。

参考：[MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)、[Three.js 安装](https://threejs.org/manual/pages/installation.html)。
