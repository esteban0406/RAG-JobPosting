export class UserProfileDto {
  id: string;
  email: string;
  name: string;
  skills: string[];
  preferredFields: string[];
  location: string | null;
  createdAt: Date;
  updatedAt: Date;
}
