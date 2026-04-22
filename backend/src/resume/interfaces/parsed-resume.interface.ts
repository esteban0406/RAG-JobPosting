export interface WorkExperience {
  company: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  description: string;
}

export interface Education {
  institution: string;
  degree: string | null;
  field: string | null;
  graduationYear: string | null;
}

export interface ParsedResume {
  name: string | null;
  email: string | null;
  linkedin: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  skills: string[];
  experience: WorkExperience[];
  education: Education[];
  certifications: string[];
}

export const NULL_PARSED_RESUME: ParsedResume = {
  name: null,
  email: null,
  linkedin: null,
  phone: null,
  location: null,
  summary: null,
  skills: [],
  experience: [],
  education: [],
  certifications: [],
};
