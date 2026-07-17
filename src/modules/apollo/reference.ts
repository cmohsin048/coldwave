/** Static reference data for the Apollo filter UI. */

export const SENIORITIES = [
  { value: "owner", label: "Owner" },
  { value: "founder", label: "Founder" },
  { value: "c_suite", label: "C-Suite" },
  { value: "partner", label: "Partner" },
  { value: "vp", label: "VP" },
  { value: "head", label: "Head" },
  { value: "director", label: "Director" },
  { value: "manager", label: "Manager" },
  { value: "senior", label: "Senior" },
  { value: "entry", label: "Entry" },
  { value: "intern", label: "Intern" },
] as const;

export const EMPLOYEE_RANGES = [
  { value: "1,10", label: "1–10" },
  { value: "11,20", label: "11–20" },
  { value: "21,50", label: "21–50" },
  { value: "51,100", label: "51–100" },
  { value: "101,200", label: "101–200" },
  { value: "201,500", label: "201–500" },
  { value: "501,1000", label: "501–1,000" },
  { value: "1001,2000", label: "1,001–2,000" },
  { value: "2001,5000", label: "2,001–5,000" },
  { value: "5001,10000", label: "5,001–10,000" },
  { value: "10001,1000000", label: "10,000+" },
] as const;
