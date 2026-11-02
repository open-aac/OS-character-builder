# Art check: side

Files: `art/source/side/bm_low.svg`, `art/source/side/bm_high.svg`

**The kit builds.**

## Worked around automatically (better fixed in the art)

- layer order differs between the two files; using the order in high
- `arm_R_lower`: nodes are spread differently along the outline in low and high; paired by position along the outline instead
- `shirt_tight_long_arm_R_lower`: points were drawn in a different order (start shifted by 46 in high); re-ordered automatically
- `shirt_loose_short_arm_R_upper`: points were drawn in a different order (start shifted by 42 in high); re-ordered automatically
- `leg_L_lower`: nodes are spread differently along the outline in low and high; paired by position along the outline instead; the outline is open in different places in the two files, so both are left open where low is (a joint, tucked under the next part)
- `leg_L_upper`: nodes are spread differently along the outline in low and high; paired by position along the outline instead; the outline is open in different places in the two files, so both are left open where high is (a joint, tucked under the next part)
- `pants_tight_short_leg_L_upper`: outline is closed in high but open in low; drawn open in both (no outline across the gap)
- `pants_tight_short_leg_L_upper`: points were drawn in a different order (start shifted by 4 in high); re-ordered automatically
- `pants_tight_long_leg_L_lower`: points were drawn in a different order (start shifted by 2 in high); re-ordered automatically
- `pants_tight_long_leg_L_upper`: points were drawn in a different order (start shifted by 28 in high); re-ordered automatically
- `pants_loose_short_leg_L_upper`: points were drawn in a different order (start shifted by 18 in high); re-ordered automatically
- `shirt_tight_short_body`: nodes are spread differently along the outline in low and high; paired by position along the outline instead
- `shirt_tight_long_body`: nodes are spread differently along the outline in low and high; paired by position along the outline instead
- `arm_L_lower`: nodes are spread differently along the outline in low and high; paired by position along the outline instead
- `shirt_tight_long_arm_L_lower`: points were drawn in a different order (start shifted by 46 in high); re-ordered automatically
- `shirt_loose_short_arm_L_upper`: points were drawn in a different order (start shifted by 42 in high); re-ordered automatically
- `head`: nodes are spread differently along the outline in low and high; paired by position along the outline instead

## For information

- bm_low.svg: 1 part(s) are scaled unevenly in Inkscape; outlines are redrawn at the exact style-guide weight, so nothing to fix.
- bm_high.svg: 1 part(s) are scaled unevenly in Inkscape; outlines are redrawn at the exact style-guide weight, so nothing to fix.
- low: made stand-in clothing shirt_loose_short_body, shirt_tight_long_arm_L_lower, shirt_tight_long_arm_L_upper, shirt_loose_short_arm_L_upper, pants_tight_long_leg_L_lower, pants_tight_long_leg_L_upper, pants_loose_short_leg_L_upper
- low: far arm made from the near arm (15 parts)
- high: made stand-in clothing shirt_loose_short_body, shirt_tight_long_arm_L_lower, shirt_tight_long_arm_L_upper, shirt_loose_short_arm_L_upper, pants_tight_long_leg_L_lower, pants_tight_long_leg_L_upper, pants_loose_short_leg_L_upper
- high: far arm made from the near arm (15 parts)
