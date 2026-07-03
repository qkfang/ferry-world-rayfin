import { Todo } from './Todo.js';
import { TourismSite } from './TourismSite.js';

export type GettingStartedSchema = {
  Todo: Todo;
  TourismSite: TourismSite;
};

export const schema = [Todo, TourismSite];
