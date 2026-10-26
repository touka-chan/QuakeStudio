import { buildDefaultContent } from './defaults';
import { contentIssues, parseContent, type ContentIssue } from './schema';
import {
  readStoredContentCheck,
  removeStoredContent,
  writeStoredContent,
} from './storage';
import {
  CONTENT_SCHEMA_VERSION,
  type AssumptionReviewContent,
  type BrandingContent,
  type ContentDocument,
  type CopyContent,
  type DriftBandContent,
  type EngineeringContent,
  type FeatureContent,
  type GlossaryEntryContent,
  type TemplateContent,
  type TourContent,
  type TourStepContent,
  type WelcomeContent,
  type WelcomeStepContent,
} from './types';

/* =========================================================================
   Mock content repository
   -------------------------------------------------------------------------
   The only layer that writes. It is replaceable: the admin calls these
   functions, never localStorage directly, so an HTTP implementation could be
   swapped in without touching a screen.

   Every write is validated as a complete document first. A partial write that
   looks fine in one panel but breaks the simulator is worse than a refused
   save, so refusal is the default.
   ========================================================================= */

export class ContentValidationError extends Error {
  readonly issues: ContentIssue[];

  constructor(issues: ContentIssue[]) {
    super(issues[0]?.message ?? 'The content could not be saved.');
    this.name = 'ContentValidationError';
    this.issues = issues;
  }
}

type CollectionMap = {
  templates: TemplateContent;
  glossary: GlossaryEntryContent;
  driftBands: DriftBandContent;
  tourSteps: TourStepContent;
  welcomeSteps: WelcomeStepContent;
};

export type CollectionKey = keyof CollectionMap;
export type CollectionItem<K extends CollectionKey> = CollectionMap[K];

function clone<T>(value: T): T {
  return structuredClone(value);
}

function listItems(doc: ContentDocument, key: CollectionKey): unknown[] {
  switch (key) {
    case 'templates':
      return doc.templates;
    case 'glossary':
      return doc.glossary;
    case 'driftBands':
      return doc.driftBands;
    case 'tourSteps':
      return doc.tour.steps;
    case 'welcomeSteps':
      return doc.welcome.steps;
  }
}

function setItems(doc: ContentDocument, key: CollectionKey, items: unknown[]): void {
  switch (key) {
    case 'templates':
      doc.templates = items as TemplateContent[];
      break;
    case 'glossary':
      doc.glossary = items as GlossaryEntryContent[];
      break;
    case 'driftBands':
      doc.driftBands = items as DriftBandContent[];
      break;
    case 'tourSteps':
      doc.tour.steps = items as TourStepContent[];
      break;
    case 'welcomeSteps':
      doc.welcome.steps = items as WelcomeStepContent[];
      break;
  }
}

function parseOrThrow(value: unknown): ContentDocument {
  const result = parseContent(value);
  if (!result.success) throw new ContentValidationError(result.issues);
  return result.data;
}

export type ContentStatus =
  | { status: 'defaults' }
  | { status: 'saved'; updatedAt: string }
  | { status: 'invalid-saved' };

export const contentRepository = {
  /** Current document, falling back to compiled defaults. */
  getDocument(): ContentDocument {
    const stored = readStoredContentCheck();
    if (stored.status === 'valid') return stored.content;
    return parseOrThrow(buildDefaultContent());
  },

  status(): ContentStatus {
    const stored = readStoredContentCheck();
    if (stored.status === 'valid') {
      return { status: 'saved', updatedAt: stored.content.updatedAt };
    }
    if (stored.status === 'invalid') return { status: 'invalid-saved' };
    return { status: 'defaults' };
  },

  /** Validate and persist a complete document. */
  replaceDocument(next: ContentDocument): ContentDocument {
    const parsed = parseOrThrow(next);
    const saved: ContentDocument = {
      ...parsed,
      schemaVersion: CONTENT_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    };
    writeStoredContent(saved);
    return saved;
  },

  /** Read, mutate a clone, validate and save in one step. */
  updateDocument(recipe: (draft: ContentDocument) => void): ContentDocument {
    const draft = clone(this.getDocument());
    recipe(draft);
    return this.replaceDocument(draft);
  },

  updateBranding(value: BrandingContent): ContentDocument {
    return this.updateDocument((draft) => {
      draft.branding = value;
    });
  },

  updateCopy(value: CopyContent): ContentDocument {
    return this.updateDocument((draft) => {
      draft.copy = value;
    });
  },

  updateEngineering(value: EngineeringContent): ContentDocument {
    return this.updateDocument((draft) => {
      draft.engineering = value;
    });
  },

  updateFeatures(value: FeatureContent): ContentDocument {
    return this.updateDocument((draft) => {
      draft.features = value;
    });
  },

  updateTour(value: TourContent): ContentDocument {
    return this.updateDocument((draft) => {
      draft.tour = value;
    });
  },

  updateWelcome(value: WelcomeContent): ContentDocument {
    return this.updateDocument((draft) => {
      draft.welcome = value;
    });
  },

  updateAssumptionReview(value: AssumptionReviewContent): ContentDocument {
    return this.updateDocument((draft) => {
      draft.assumptionReview = value;
    });
  },

  list<K extends CollectionKey>(key: K): CollectionItem<K>[] {
    return listItems(this.getDocument(), key) as CollectionItem<K>[];
  },

  get<K extends CollectionKey>(key: K, id: string): CollectionItem<K> | undefined {
    return this.list(key).find((item) => item.id === id);
  },

  create<K extends CollectionKey>(key: K, item: CollectionItem<K>): CollectionItem<K> {
    const saved = this.updateDocument((draft) => {
      const items = listItems(draft, key) as Array<{ id: string }>;
      if (items.some((existing) => existing.id === item.id)) {
        throw new ContentValidationError([
          { path: `${key}.id`, message: 'That id is already in use.' },
        ]);
      }
      setItems(draft, key, [...items, item]);
    });
    const created = (listItems(saved, key) as CollectionItem<K>[]).find(
      (candidate) => candidate.id === item.id,
    );
    if (!created) throw new Error('The item was saved but could not be read back.');
    return created;
  },

  update<K extends CollectionKey>(
    key: K,
    id: string,
    patch: Partial<CollectionItem<K>>,
  ): CollectionItem<K> {
    const saved = this.updateDocument((draft) => {
      const items = listItems(draft, key) as Array<CollectionItem<K>>;
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) {
        throw new ContentValidationError([
          { path: `${key}.id`, message: 'That item no longer exists.' },
        ]);
      }
      items[index] = { ...items[index], ...patch };
      setItems(draft, key, items);
    });
    const updated = (listItems(saved, key) as CollectionItem<K>[]).find(
      (candidate) => candidate.id === id,
    );
    if (!updated) throw new Error('The item was saved but could not be read back.');
    return updated;
  },

  remove(key: CollectionKey, id: string): ContentDocument {
    return this.updateDocument((draft) => {
      if (key === 'templates') {
        if (id === 'custom') {
          throw new ContentValidationError([
            { path: 'templates', message: 'The Custom template is required.' },
          ]);
        }
        if (id === draft.defaultTemplateId) {
          throw new ContentValidationError([
            {
              path: 'templates',
              message: 'Choose another startup template before deleting this one.',
            },
          ]);
        }
      }

      if (key === 'driftBands') {
        if (draft.driftBands.length <= 2) {
          throw new ContentValidationError([
            { path: 'driftBands', message: 'Keep at least two drift bands.' },
          ]);
        }
        const index = draft.driftBands.findIndex((band) => band.id === id);
        if (index === draft.driftBands.length - 1) {
          throw new ContentValidationError([
            { path: 'driftBands', message: 'Edit the open-ended band instead of deleting it.' },
          ]);
        }
      }

      if (key === 'tourSteps' && draft.tour.steps.length <= 1) {
        throw new ContentValidationError([
          { path: 'tour.steps', message: 'Keep at least one tour step.' },
        ]);
      }

      if (key === 'welcomeSteps' && draft.welcome.steps.length <= 1) {
        throw new ContentValidationError([
          { path: 'welcome.steps', message: 'Keep at least one welcome step.' },
        ]);
      }

      const items = listItems(draft, key) as Array<{ id: string }>;
      setItems(
        draft,
        key,
        items.filter((item) => item.id !== id),
      );
    });
  },

  exportJson(): string {
    return `${JSON.stringify(this.getDocument(), null, 2)}
`;
  },

  importJson(raw: string): ContentDocument {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ContentValidationError([
        { path: 'document', message: 'That file is not valid JSON.' },
      ]);
    }
    const document = parseOrThrow(parsed);
    return this.replaceDocument(document);
  },

  reset(): void {
    removeStoredContent();
  },

  /** Exposed for tests and for a future HTTP implementation. */
  validate(value: unknown): ContentDocument {
    return parseOrThrow(value);
  },
};

export { contentIssues };
