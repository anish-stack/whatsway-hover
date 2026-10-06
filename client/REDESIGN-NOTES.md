# Redesign notes

No logic changed. Only styles, class names and JSX markup.

## Tokens (src/index.css)
Palette supplied by project owner, declared verbatim on `:root`:

primary `#08A957` · hover `#078C49` · light `#D9F7E7` · soft `#EAFBF2`
dark `#071A2D` · footer `#003F35` · text `#465568` · text-muted `#6B7788`
background `#FFFFFF` · background-soft `#F7FAF9` · border `#E2E9E6`
purple `#8247E5` · orange `#FF8A34` · pink `#F34C8B` · yellow `#FFB800`

Design-system aliases map onto these, so both naming schemes work:
`--brand` = primary, `--flare` = orange, `--ink` = dark, `--canvas` =
background-soft, `--mist` = border. Status: ok = primary, warn = yellow,
bad = pink, info = purple.

Dark mode under `.dark` derives from the same palette (ThemeToggle works).

## Utility classes available
shell · band · band-tight · canvas-bg · ink-bg
display-xl · display-lg · display-md · lede · measure
surface · surface-soft · plate · plate-flare · shelf · hair
btn + btn-brand / btn-flare / btn-ink / btn-quiet
chip · chip-flare · chip-ok
stat-tile · stat-figure · stat-label
thread · bubble-in · bubble-out
dots-bg · grid-bg · hover-lift · rise · fade-in · pulse-gentle

## Files rewritten
index.css, index.html (font links)
ui/: button, card, badge, input, textarea, select, tabs, table, skeleton
landing: Hero, Features, HowItWorks, UseCases, Testimonials, Pricing, CTA, Footer, Header
app shell: layout/header.tsx, layout/sidebar.tsx, CardStat
layout/AppLayout.tsx: default brand color is now #5b2bd9 and white-label
primaryColor also drives --brand / --brand-600 / --brand-700 / --brand-100 / --brand-50

## Global sweep
~124 dashboard files: bg-white -> bg-background, text-gray-* -> text-foreground /
text-muted-foreground, border-gray-* -> border-border.
Marketing files: emerald/teal/green brand colors -> brand CSS vars.
This is what makes dark mode and white-labelling work everywhere.

## Needs your tailwind.config
Config file was not in the zip. Nothing new is required — all new styles use
CSS variables or core Tailwind classes. If `darkMode: ["class"]` is missing,
add it to enable the dark theme.
