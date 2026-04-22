import type {
  Education,
  ParsedResume,
  WorkExperience,
} from '../interfaces/parsed-resume.interface.js';

export class ResumeResponseDto implements ParsedResume {
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
  updatedAt: Date;
}
