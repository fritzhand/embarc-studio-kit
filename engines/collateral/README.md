# Static collateral: the collateral builder

Posts, stories, slides, banners, flyers, and one-pagers, in your brand, in five formats (US Letter, 4:5, 1:1, 16:9,
9:16), made by telling an agent what you want. It is a separate open-source repo,
[fritzhand/collateral-builder](https://github.com/fritzhand/collateral-builder) (MIT), and this kit uses its brand
format, so **one brand folder drives both**: the same `brands/<your-brand>/` styles your video cards and your posts.

```bash
npm run engines:fetch                      # clones it to vendor/collateral-builder/ (not committed)
node scripts/share-brand.mjs <your-brand>  # copies brands/<your-brand>/ into it
cd vendor/collateral-builder && npm run dev
```

Then follow its `AGENTS.md`. Pieces worth making from one founder session:

| Piece | Format | From |
|---|---|---|
| A quote card | 4:5 and 1:1 | A soundbite's exact words (the transcript), with the founder's name |
| The founder video's cover | 9:16 and 16:9 | The title card's words; a still from the interview |
| A carousel: what we do, why, who it is for | 4:5, five slides | Sections 2 to 5 of the interview |
| A one-pager | US Letter | The whole interview, the figures you can source, your URL |

Ask your agent: *"Read engines/collateral/README.md. From projects/<name>/transcript.json, make a four-slide 4:5
carousel and two quote cards in brands/<name>, using only the founder's exact words."*
