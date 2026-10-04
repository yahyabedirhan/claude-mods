// The pane's sections in the order the spec agrees. Each section lives in a
// file of its own; change a section there, not here.

import { blockedSection } from './blocked'
import { countersSection } from './counters'
import { doingNowSection } from './doing-now'
import { effortSection } from './effort'
import { historySection } from './history'
import { lastUpdateSection } from './last-update'
import { linksSection } from './links'
import { reviewLaterSection } from './review-later'
import { sessionSection } from './session'
import type { Section } from './section'
import { surprisesSection } from './surprises'

export const SECTIONS: readonly Section[] = [
  doingNowSection,
  blockedSection,
  reviewLaterSection,
  sessionSection,
  effortSection,
  linksSection,
  surprisesSection,
  countersSection,
  historySection,
  lastUpdateSection,
]
