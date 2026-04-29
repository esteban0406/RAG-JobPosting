export class UserProfileDto {
  id: string;
  email: string;
  name: string;
  skills: string[];
  preferredFields: string[];
  location: string | null;
  hasResume: boolean;
  createdAt: Date;
  updatedAt: Date;
}
