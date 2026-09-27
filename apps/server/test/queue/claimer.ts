import { openDb } from '../../src/db/index.ts'
import { claimNext, completeJob } from '../../src/queue/queue.ts'

const [file, startAtText] = process.argv.slice(2)
if (!file || !startAtText) throw new Error('usage: claimer.ts <database file> <start time in ms>')
const db = openDb(file)
const wait = Number(startAtText) - Date.now()
if (wait > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait)
const claimed: number[] = []
for (let job = claimNext(db); job; job = claimNext(db)) {
  claimed.push(job.id)
  completeJob(db, job.id)
}
db.close()
process.stdout.write(JSON.stringify(claimed))
