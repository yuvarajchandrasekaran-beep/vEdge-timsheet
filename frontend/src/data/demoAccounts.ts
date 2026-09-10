import type { RoleName } from "../types";

// Hardcoded per CONTRACT.md Section 5 — used ONLY for the Login screen's
// "demo accounts" click-to-fill helper list. All actual data (auth, profile,
// timesheets, etc.) is fetched from the API via React Query hooks. Must be
// kept in sync with backend/prisma/seed.ts's user roster by hand — there is
// no API call backing this list.
export interface DemoAccount {
  employeeId: string;
  name: string;
  email: string;
  role: RoleName;
  department: string;
  jobTitle: string;
}

export const DEMO_PASSWORD = "Password123!";

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    employeeId: "VE-2000",
    name: "Bhaskar Dasari",
    email: "bdasari@vivid-edge.com",
    role: "SUPER_ADMIN",
    department: "Operations",
    jobTitle: "Super Admin",
  },
  {
    employeeId: "VE-2001",
    name: "Jeff Cockman",
    email: "jeff.cockman@vivid-edge.com",
    role: "SUPER_ADMIN",
    department: "Operations",
    jobTitle: "Super Admin",
  },
  {
    employeeId: "VE-2002",
    name: "Shibani Gandhi",
    email: "shibani.gandhi@vivid-edge.com",
    role: "HR_ADMIN",
    department: "HR",
    jobTitle: "HR Admin",
  },
  {
    employeeId: "VE-2003",
    name: "Ramesh Natarajan",
    email: "ramesh.natarajan@vivid-edge.com",
    role: "PROJECT_ADMIN",
    department: "Engineering",
    jobTitle: "Project Admin",
  },
  {
    employeeId: "VE-2004",
    name: "Ramakrishna Avalur",
    email: "ramakrishna.avalur@vivid-edge.com",
    role: "INDIVIDUAL_USER",
    department: "Engineering",
    jobTitle: "Software Engineer",
  },
  {
    employeeId: "VE-2005",
    name: "Ravi Angara",
    email: "ravi.angara@vivid-edge.com",
    role: "INDIVIDUAL_USER",
    department: "Engineering",
    jobTitle: "Software Engineer",
  },
  {
    employeeId: "VE-2006",
    name: "Raghu Muniyappa",
    email: "raghu.muniyappa@vivid-edge.com",
    role: "INDIVIDUAL_USER",
    department: "Engineering",
    jobTitle: "Software Engineer",
  },
  {
    employeeId: "VE-2007",
    name: "Steven Dsouza",
    email: "steven.dsouza@vivid-edge.com",
    role: "INDIVIDUAL_USER",
    department: "QA",
    jobTitle: "QA Engineer",
  },
  {
    employeeId: "VE-2008",
    name: "Indira Chunduri",
    email: "indira.chunduri@vivid-edge.com",
    role: "INDIVIDUAL_USER",
    department: "Business",
    jobTitle: "Business Analyst",
  },
  {
    employeeId: "VE-2009",
    name: "Krishna Sindhuja",
    email: "krishna.sindhuja@vivid-edge.com",
    role: "INDIVIDUAL_USER",
    department: "QA",
    jobTitle: "QA Engineer",
  },
  {
    employeeId: "VE-2010",
    name: "Yuvaraj Chandrasekaran",
    email: "yuvaraj.chandrasekaran@vivid-edge.com",
    role: "INDIVIDUAL_USER",
    department: "Operations",
    jobTitle: "Consultant",
  },
];
