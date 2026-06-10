export function partyAbbrev(party: string): string {
  if (party === "Democrat") return "D";
  if (party === "Republican") return "R";
  if (party === "Independent") return "I";
  return party.slice(0, 1);
}

// Badge styling per party. Red/blue here are semantic (party), distinct from
// the site's flag palette usage.
export function partyBadgeClass(party: string): string {
  if (party === "Republican") return "bg-flag-red-soft text-flag-red";
  if (party === "Democrat") return "bg-flag-blue-soft text-flag-blue";
  return "bg-gray-100 text-gray-700";
}

export function positionLabel(position: string): string {
  if (position === "yea") return "Yea";
  if (position === "nay") return "Nay";
  if (position === "present") return "Present";
  return "Not Voting";
}

export function positionBadgeClass(position: string): string {
  if (position === "yea") return "bg-green-50 text-green-800";
  if (position === "nay") return "bg-flag-red-soft text-flag-red";
  return "bg-gray-100 text-gray-600";
}

export function seatLabel(member: {
  chamber: string;
  state: string;
  district: string | null;
}): string {
  if (member.chamber === "senate") return `Senator · ${member.state}`;
  const district =
    member.district === "0" ? "At-Large" : `District ${member.district}`;
  return `Representative · ${member.state}-${member.district === "0" ? "AL" : member.district} (${district})`;
}

export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
