import { Todo } from './Todo.js';
import { FerryVessel } from './FerryVessel.js';
import { TourismSite } from './TourismSite.js';

export type GettingStartedSchema = {
  Todo: Todo;
  TourismSite: TourismSite;
  FerryVessel: FerryVessel;
};

export const schema = [Todo, TourismSite, FerryVessel];
