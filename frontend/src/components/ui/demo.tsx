"use client"

import RidgelineDitherFooter from "@/components/ui/ridgeline-dither-footer"

export default function DemoGlacier() {
  return (
    <div className="w-full">
      <RidgelineDitherFooter
        preset="glacier"
        seed={23}
        ridges={7}
        name="Northwall"
        tagline="Expedition planning for teams who go further — routes, permits and weather in one place."
        columns={[
          { title: "Plan", links: [{ label: "Routes" }, { label: "Forecasts", badge: "New" }, { label: "Permits" }] },
          { title: "Guides", links: [{ label: "Field notes" }, { label: "Gear lists" }, { label: "Safety" }] },
          { title: "Company", links: [{ label: "About" }, { label: "Press" }, { label: "Contact" }] },
        ]}
        socials={[
          { icon: "instagram", href: "https://instagram.com" },
          { icon: "youtube", href: "https://youtube.com" },
          { icon: "github", href: "https://github.com" },
        ]}
        credit={{ label: "Basecamp Studio", href: "#" }}
      />
    </div>
  )
}

