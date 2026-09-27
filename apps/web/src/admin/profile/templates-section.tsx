import { useTemplates } from '../api'
import { QueryState } from '../components/query-state'

export function TemplatesSection({ enabled }: { enabled: boolean }) {
  const templates = useTemplates(enabled)
  return (
    <section aria-labelledby="templates-heading" className="grid gap-2">
      <h3 id="templates-heading" className="text-sm font-semibold">
        Slide templates
      </h3>
      <p className="text-xs text-muted-foreground">The layout is fixed. A developer changes it in the scene file.</p>
      <QueryState query={templates} label="the slide templates">
        {(list) => (
          <ul className="grid grid-cols-2 gap-2">
            {[...list]
              .sort((a, b) => a.slide - b.slide)
              .map((template) => (
                <li key={template.slide}>
                  <figure className="grid gap-1">
                    {template.imageUrl ? (
                      <img
                        src={template.imageUrl}
                        alt={`Slide ${template.slide} template: ${template.name}`}
                        loading="lazy"
                        className="aspect-video w-full rounded-md border object-cover"
                      />
                    ) : (
                      <div className="grid aspect-video w-full place-items-center rounded-md border border-dashed text-xs text-muted-foreground">
                        No preview
                      </div>
                    )}
                    <figcaption className="text-xs">{`${template.slide}. ${template.name}`}</figcaption>
                  </figure>
                </li>
              ))}
          </ul>
        )}
      </QueryState>
    </section>
  )
}
