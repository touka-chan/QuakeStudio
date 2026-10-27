import { useAdminContent } from '../AdminContext';
import { SectionCard, AdminPageHeader } from '../AdminForms';

export function AdminDashboard() {
  const { content } = useAdminContent();
  const cards = [
    { label: 'Templates', value: content.templates.length },
    { label: 'Glossary entries', value: content.glossary.length },
    { label: 'Tour steps', value: content.tour.steps.length },
    { label: 'Welcome steps', value: content.welcome.steps.length },
    { label: 'Drift bands', value: content.driftBands.length },
    { label: 'Copy keys', value: Object.keys(content.copy).length },
  ];

  return (
    <div>
      <AdminPageHeader title="Dashboard" description="Overview of stored content and system status." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <SectionCard key={card.label} title={card.label} description={`${card.value} items`}>
            <p className="text-3xl font-bold tracking-tight">{card.value}</p>
          </SectionCard>
        ))}
      </div>
      <SectionCard title="Storage status" description="Browser-local content storage." className="mt-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Last saved: <span className="font-medium text-foreground">{content.updatedAt}</span>
          </p>
          <p className="text-xs text-muted-foreground">Changes are stored in this browser and applied after a simulator reload.</p>
        </div>
      </SectionCard>
    </div>
  );
}
