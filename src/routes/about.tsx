import { createFileRoute } from "@tanstack/react-router";
import { EditableText } from "@/components/editable-text";

import castAsset from "@/assets/premxl-cast.asset.json";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About D Mojo Art — Film & Event Production House" },
      {
        name: "description",
        content:
          "D Mojo Art is an Assam-based film and event production house behind PremXL and live cultural shows.",
      },
      { property: "og:title", content: "About D Mojo Art" },
      {
        property: "og:description",
        content: "An Assam-based film and event production house telling regional stories.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: About,
});

function About() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-20">
      <p className="text-xs font-bold tracking-[0.45em] text-primary"><EditableText id="about.kicker">ABOUT US</EditableText></p>
      <h1 className="mt-4 text-4xl md:text-6xl">
        <EditableText id="about.title">We make films that sound like home.</EditableText>
      </h1>
      <p className="mt-6 max-w-3xl text-lg text-muted-foreground">
        <EditableText id="about.body" multiline>
          D Mojo Art is a production house from Assam working across feature films, music videos and live events. We build stories around the people, dialects and landscapes of the North East, and bring them to cinema halls and stages across the region.
        </EditableText>
      </p>

      <img src={castAsset.url} alt="The PremXL cast" className="mt-12 w-full max-w-3xl" />

      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {[
          { k: "Founded", v: "Guwahati, Assam" },
          { k: "Focus", v: "Feature films, music, live events" },
          { k: "Now showing", v: "PremXL — 2 Oct 2026" },
        ].map((x) => (
          <div key={x.k} className="panel p-6">
            <p className="text-xs font-bold tracking-[0.25em] text-primary"><EditableText id={`about.fact.${x.k}.label`}>{x.k.toUpperCase()}</EditableText></p>
            <p className="mt-2 text-lg"><EditableText id={`about.fact.${x.k}.value`}>{x.v}</EditableText></p>
          </div>
        ))}
      </div>
    </div>
  );
}
