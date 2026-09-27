import { useId, useState, type ReactNode } from 'react'
import { fileExtension, useMediaRecorder, type RecorderKind } from '@/hooks/use-media-recorder'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useReturnFocus } from '../lib/use-return-focus'
import { RecorderPanel } from './recorder-panel'

interface MediaUploadDialogProps {
  kind: RecorderKind
  maxS: number
  title: string
  description: string
  fileLabel: string
  fileName: string
  submitLabel: string
  pending: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (file: File, close: () => void) => void
  canSubmit?: boolean
  children?: ReactNode
}

export function MediaUploadDialog(props: MediaUploadDialogProps) {
  const { kind, maxS, title, description, fileLabel, fileName, submitLabel, pending, open, onOpenChange, onSubmit, children } = props
  const canSubmit = props.canSubmit ?? true
  const recorder = useMediaRecorder(kind, maxS)
  const [mode, setMode] = useState<'record' | 'file'>('record')
  const [file, setFile] = useState<File | null>(null)
  const fileId = useId()
  const returnFocus = useReturnFocus()
  const recording = recorder.recording
  const ready = mode === 'record' ? recording !== null : file !== null

  const close = () => {
    recorder.close()
    recorder.discard()
    setFile(null)
    onOpenChange(false)
  }

  const submit = () => {
    const source =
      mode === 'file'
        ? file
        : recording
          ? new File([recording.blob], `${fileName}.${fileExtension(recording.mimeType)}`, { type: recording.mimeType })
          : null
    if (source) onSubmit(source, close)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent {...returnFocus} className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(value) => setMode(value === 'file' ? 'file' : 'record')}>
          <TabsList>
            <TabsTrigger value="record">Record</TabsTrigger>
            <TabsTrigger value="file">Upload a file</TabsTrigger>
          </TabsList>
          <TabsContent value="record" className="pt-2">
            <RecorderPanel kind={kind} controls={recorder} />
          </TabsContent>
          <TabsContent value="file" className="grid gap-1.5 pt-2">
            <Label htmlFor={fileId}>{fileLabel}</Label>
            <Input
              id={fileId}
              type="file"
              accept={kind === 'video' ? 'video/*' : 'audio/*'}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </TabsContent>
        </Tabs>
        {children}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (!pending) submit()
            }}
            disabled={!ready || !canSubmit}
            aria-disabled={pending || undefined}
            className="aria-disabled:opacity-50"
          >
            {pending ? 'Uploading' : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
