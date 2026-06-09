# GitHub Pages 部署

## 方式一：网页上传

1. 登录 GitHub，新建公开仓库，例如 `photo-weather-pwa`。
2. 上传本目录内的所有文件。
3. 进入仓库 `Settings` -> `Pages`。
4. `Build and deployment` 选择 `Deploy from a branch`。
5. Branch 选择 `main`，目录选择 `/root`。
6. 保存后等待 1 到 3 分钟，GitHub 会生成公网地址。

## 方式二：命令行推送

如果已经创建空仓库，把下面的地址换成你的仓库地址：

```powershell
git remote add origin https://github.com/你的用户名/photo-weather-pwa.git
git branch -M main
git push -u origin main
```

然后在仓库 `Settings` -> `Pages` 里选择 `main` 分支和 `/root`。
