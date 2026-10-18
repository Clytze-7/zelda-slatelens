# SlateLens

[简体中文](README.md) | [English](README.en.md)

[Live demo](https://zelda-slatelens.vercel.app/)

**Sheikah-style camera frame editor inspired by _The Legend of Zelda: Breath of the Wild_.**

SlateLens is a frontend-only image editor. Choose a local picture and add a Sheikah-style viewfinder and recognition label. The project is currently a prototype.

## Example output

<a href="docs/images/Long-tailed%20Shrike-20261017.jpg"><img src="docs/images/Long-tailed%20Shrike-20261017-preview.jpg" alt="SlateLens example output: Long-tailed Shrike" width="420"></a>

Click the preview to view the full-size example.

## Current features

- Choose, preview, and edit local images in the browser without uploading them to a server.
- The fixed viewfinder stays Sheikah blue. Drag or resize the single tracking frame and customize its target name; the frame is blue when recorded and orange when unrecorded.
- Export a PNG at the original image dimensions, or a compressed JPG with a maximum long edge of 2560 pixels. JPG uploads enable compressed export by default, and you can change the setting.
- Export filenames use `Target Name-YYYYMMDD.png/jpg`. The date comes from the capture date, then the file modification date, then the current day.
- Use a responsive layout on desktop and mobile.

**Not yet implemented:** cropping. The Zoom gauge is decorative and does not change image magnification.

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
