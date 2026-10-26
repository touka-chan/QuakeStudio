import { applyEngineeringContent } from './engineeringAssumptions';
import { readStoredContent } from '@/content/storage';

const storedEngineering = readStoredContent()?.engineering;
if (storedEngineering) {
  applyEngineeringContent(storedEngineering);
}
