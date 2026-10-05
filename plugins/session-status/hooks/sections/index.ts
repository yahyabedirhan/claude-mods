// The pane's sections in the order the spec agrees. Each section lives in a
// file of its own; change a section there, not here.

import { blockedSection } from './blocked'
import { blockersSection } from './blockers'
import { countersSection } from './counters'
import { createdSection } from './created'
import { cronsSection } from './crons'
import { doingNowSection } from './doing-now'
import { effortSection } from './effort'
import { historySection } from './history'
import { lastUpdateSection } from './last-update'
import { observationsSection } from './observations'
import { placesSection } from './places'
import { reviewLaterSection } from './review-later'
import { sessionSection } from './session'
import type { Section } from './section'
import { stateSection } from './state'
import { surprisesSection } from './surprises'

export const SECTIONS: readonly Section[] = [
  stateSection,
  doingNowSection,
  blockedSection,
  blockersSection,
  sessionSection,
  effortSection,
  createdSection,
  placesSection,
  surprisesSection,
  reviewLaterSection,
  observationsSection,
  countersSection,
  cronsSection,
  historySection,
  lastUpdateSection,
]
