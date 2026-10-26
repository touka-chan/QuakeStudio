import { useAdminContent } from '../AdminContext';
import { SectionCard } from '../AdminForms';

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
      
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <SectionCard key={card.label} title={card.label}>
            <p className="text-3xl font-semibold">{card.value}</p>
          </SectionCard>
        ))}
      </div>
      <SectionCard title="Storage status" className="mt-4">
        <p className="text-sm text-muted-foreground">
          Last saved: {content.updatedAt}. Changes are stored in this browser and applied after a simulator reload.
        </p>
      </SectionCard>
    </div>
  );
}
