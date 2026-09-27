import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource-variable/lora'
import { makeProject } from '@revideo/core'
import scene, { CANVAS_BACKGROUND } from './scene.tsx'
import { SCENE_FPS, SCENE_HEIGHT, SCENE_WIDTH } from './timing.ts'

export default makeProject({
  scenes: [scene],
  settings: {
    shared: { size: { x: SCENE_WIDTH, y: SCENE_HEIGHT }, background: CANVAS_BACKGROUND },
    rendering: { fps: SCENE_FPS, exporter: { name: '@revideo/core/wasm' } },
  },
})
