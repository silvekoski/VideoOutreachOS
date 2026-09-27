import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { renderVideo } from '@revideo/renderer'
import type { ChildJob, ChildMessage } from './job.ts'

const PROGRESS_STEP = 0.01

function send(message: ChildMessage): Promise<void> {
  return new Promise((resolve) => {
    if (!process.send || !process.connected) {
      resolve()
      return
    }
    process.send(message, undefined, undefined, () => resolve())
  })
}

function base64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

process.on('disconnect', () => process.exit(1))

const jobFile = process.argv[2]
if (!jobFile) throw new Error('Usage: child.ts <job file>')
const job = JSON.parse(await readFile(jobFile, 'utf8')) as ChildJob
let reported = 0

try {
  const file = await renderVideo({
    projectFile: './src/project.ts',
    variables: {
      input: base64(JSON.stringify(job.input)),
      still: job.still ? base64(job.still) : '',
    },
    settings: {
      outFile: job.outName,
      outDir: path.relative(process.cwd(), job.outDir),
      workers: 1,
      logProgress: false,
      viteBasePort: job.port,
      ffmpeg: { ffmpegPath: job.ffmpegPath, ffprobePath: job.ffprobePath, ffmpegLogLevel: 'error' },
      puppeteer: { executablePath: job.chromePath },
      projectSettings: { exporter: { name: '@revideo/core/wasm' } },
      viteConfig: { server: { fs: { allow: job.fsAllow } }, logLevel: 'warn' },
      progressCallback: (_worker, progress) => {
        if (progress < reported + PROGRESS_STEP && progress < 1) return
        reported = progress
        void send({ type: 'progress', progress })
      },
    },
  })
  await send({ type: 'done', file: path.resolve(file) })
  process.exit(0)
} catch (error) {
  await send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  process.exit(1)
}
