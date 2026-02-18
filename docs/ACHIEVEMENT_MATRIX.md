# Achievement Matrix

게임별 업적은 `src/platform/AchievementSystem.js`에서 `metric + threshold` 조건으로 평가된다.

## neon-block
- `playCount`: `nb_play_1`, `nb_play_10`
- `highScore`: `nb_score_3000`, `nb_score_12000`
- `totalStageClears`: `nb_stage_25`
- `maxCombo`: `nb_combo_20`
- `item.multiball`: `nb_item_multiball_5`
- `item.shield`: `nb_item_shield_5`
- `totalItemsCollected`: `nb_items_30`
- `totalScore`: `nb_total_score_50000`
- `bestStage`: `nb_best_stage_15`

## neon-findmine
- `playCount`: `nf_play_1`, `nf_play_8`, `nf_play_20`
- `highScore`: `nf_high_900`
- `totalStageClears`: `nf_total_stage_8`, `nf_total_stage_25`
- `item.flag`: `nf_item_flag_40`
- `bestStage`: `nf_best_stage_3`
- `totalScore`: `nf_total_score_6000`

## neon-slotmachine
- `playCount`: `ns_play_1`, `ns_play_15`
- `highScore`: `ns_high_3000`, `ns_high_9000`
- `totalStageClears`: `ns_stage_10`
- `item.spin_chip`: `ns_item_spin_120`
- `item.bingo`: `ns_item_bingo_30`
- `item.skull_bingo`: `ns_item_skull_5`
- `totalScore`: `ns_total_score_50000`
- `bestStage`: `ns_best_stage_12`

## neon-survivor
- `playCount`: `nv_play_1`, `nv_play_10`
- `highScore`: `nv_high_20000`, `nv_high_60000`
- `totalStageClears`: `nv_stage_40`
- `maxCombo`: `nv_combo_25`
- `totalComboCount`: `nv_combo_total_250`
- `item.fireball`: `nv_item_fireball_5`
- `item.ricochet`: `nv_item_ricochet_5`
- `totalItemsCollected`: `nv_items_35`
- `totalScore`: `nv_total_score_150000`
- `bestStage`: `nv_best_stage_25`

## 참고
- `item.*` 지표는 각 게임 HTML bridge에서 `itemCounts` 누적으로 전달한다.
- 최종 저장 필드는 `StorageManager.recordGameSession()`에서 누적된다.
