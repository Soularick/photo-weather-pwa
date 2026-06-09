# 观天 PWA 原型

一个面向 iPhone 主屏幕使用的摄影天气 PWA 原型，用来查看今日朝霞、晚霞、星空概率和蓝调时间。

## 本地预览

在本目录的上一级运行：

```powershell
python -m http.server 5173 --bind 127.0.0.1 -d photo-weather-pwa
```

然后打开：

```text
http://127.0.0.1:5173/
```

## 数据和算法

- 天气数据来自 Open-Meteo 免费接口。
- 定位使用浏览器 Geolocation。
- 朝霞/晚霞概率由中高云、低云、降水概率和能见度计算。
- 星空概率由总云量、降水概率、能见度和本地月光估算计算。
- 蓝调时间用太阳高度角约 -4 到 -6 度估算。

## iPhone 使用

部署到 HTTPS 后，用 iPhone Safari 打开网址，选择“分享”里的“添加到主屏幕”。
