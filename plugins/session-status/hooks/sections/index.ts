// The pane's sections in the agreed order. Each section lives in a file of
// its own; change a section there, not here.

import { blockedSection } from './blocked'
import { blockersSection } from './blockers'
import { countersSection } from './counters'
import { linksSection } from './links'
import { cronsSection } from './crons'
import { decideSection } from './decide'
import { doingNowSection } from './doing-now'
import { effortSection } from './effort'
import { taskSection } from './task'
import { followUpSection } from './follow-up'
import { historySection } from './history'
import { lastUpdateSection } from './last-update'
import { observationsSection } from './observations'
import { placesSection } from './places'
import type { Section } from './section'
import { sessionSection } from './session'
import { stateSection } from './state'
import { surprisesSection } from './surprises'

export const SECTIONS: readonly Section[] = [
  stateSection,
  doingNowSection,
  blockedSection,
  blockersSection,
  sessionSection,
  effortSection,
  taskSection,
  linksSection,
  placesSection,
  decideSection,
  followUpSection,
  surprisesSection,
  observationsSection,
  countersSection,
  cronsSection,
  historySection,
  lastUpdateSection,
]
