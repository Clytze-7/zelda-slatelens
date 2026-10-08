# SlateLens

[简体中文](README.md) | [English](README.en.md)

**Sheikah-style camera frame editor inspired by _The Legend of Zelda: Breath of the Wild_.**

SlateLens 是一个纯前端图片编辑器：选择本地图片，在画面上添加希卡风格的固定取景框和识别提示。项目目前处于原型阶段。

## 当前功能

- 在浏览器中读取并预览本地图片，无需上传到服务器。
- 显示始终为希卡蓝色的固定取景框。
- 拖动单个追踪框，并通过滑块调整大小。
- 输入识别名称；已记录时追踪框为希卡蓝色，未记录时为橘色。
- 提供桌面和移动端的基础响应式布局。

**尚未实现：** 图片导出、压缩导出和裁剪。当前预览不能直接保存为成品图片。

## 本地运行

需要 Node.js 和 npm。在项目目录执行：

```bash
npm install
npm run dev
```

终端会显示本地预览地址。检查代码可运行：

```bash
npm run build
npm run lint
```

## 技术栈

- React、TypeScript、Vite
- [Konva / react-konva](https://konvajs.org/)：图片预览与可拖动图形
- [zelda-hyrule-ui](https://github.com/chaos-xxl/zelda-hyrule-ui)：编辑器界面组件

## 声明

本项目是受《塞尔达传说：旷野之息》启发的**非官方粉丝项目**，与任天堂没有关联，也未获得其背书。游戏名称及相关标识归各自权利人所有。项目使用的第三方组件遵循各自的许可证。

本仓库目前尚未为项目源码指定开放使用的许可证。
