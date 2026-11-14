/**
 * Единая точка входа для анимаций.
 * Импортируйте отсюда, а не из отдельных файлов — так проще контролировать
 * дерево зависимостей и не допустить циклических импортов.
 */

export {
  SPRING_PRESETS,
  createSpring,
  animateCssVar,
  type SpringPreset,
  type SpringPresetName,
  type SpringOptions,
  type SpringAnimationHandle
} from './spring';

export { animationManager, runAnimationLoop } from './manager';

export { applyStagger, animateListInsert, type StaggerOptions } from './stagger';

export {
  animateCheckmark,
  animateStreakLoss,
  animateMilestonePulse,
  animateShieldEvaporate
} from './checkmark';

export { animateRemove, animateFlip } from './remove';

export {
  animateTrashIn,
  animateRestoreOut,
  drawStackLine,
  animateStackProgress
} from './lifecycle';
