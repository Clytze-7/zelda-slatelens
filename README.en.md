# SlateLens

[简体中文](README.md) | [English](README.en.md)

**Sheikah-style camera frame editor inspired by _The Legend of Zelda: Breath of the Wild_.**

SlateLens is a frontend-only image editor. Choose a local picture and add a Sheikah-style viewfinder and recognition label. The project is currently a prototype.

## Current features

- Choose and preview local images.
- Export PNGs at the original image dimensions or compressed JPGs.
- Add a Sheikah-style viewfinder with recorded and unrecorded recognition styles.
- Drag or resize the tracking frame and customize the target name.
- Use a responsive layout on desktop and mobile.

**Not yet implemented:** cropping.

## Run locally

Node.js and npm are required. In the project directory, run:

```bash
npm install
npm run dev
```

The terminal will show the local preview URL. To check the code, run:

```bash
npm run build
npm run lint
```

## Tech stack

- React, TypeScript, Vite
- [Konva / react-konva](https://konvajs.org/) for the image preview and draggable graphics
- [zelda-hyrule-ui](https://github.com/chaos-xxl/zelda-hyrule-ui) for editor interface components

## Disclaimer

This is an **unofficial fan project** inspired by _The Legend of Zelda: Breath of the Wild_. It is not affiliated with or endorsed by Nintendo. Game names and related marks belong to their respective owners. Third-party components are subject to their own licenses.

No license has been selected for this project's source code yet.
