// Shared resume-import types (mirror of the API contract) and file helpers.

export interface ParsedWorkExperience {
  company: string | null;
  title: string | null;
  start: string | null;
  end: string | null;
  current: boolean;
  duration_years: number;
}

export interface ParsedEducation {
  degree: string;
  institution: string | null;
  year: string | null;
}

export interface ParsedSkill {
  skill_name: string;
  normalized_skill: string;
  proficiency: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EXPERT';
  frequency: number;
}

export interface ParsedResume {
  full_name: string | null;
  headline: string | null;
  email: string | null;
  phone: string | null;
  experience_years: number;
  experience_years_source: 'stated' | 'computed' | 'default';
  skills: ParsedSkill[];
  work_experience: ParsedWorkExperience[];
  education: ParsedEducation[];
  summary: string;
}

export interface ParseResumePayload {
  text?: string;
  filename?: string;
  content_base64?: string;
}

export interface ParseResumeResult {
  parsed: ParsedResume;
  resume_text: string;
  filename: string | null;
}

export interface ApplyResumePayload {
  full_name?: string;
  headline?: string;
  summary?: string;
  experience_years?: number;
  resume_text: string;
  work_experience?: ParsedWorkExperience[];
  education?: ParsedEducation[];
  skills?: Array<{
    skill_name: string;
    proficiency?: string;
    years_experience?: number;
  }>;
}

export interface ApplyResumeResult {
  profile: any;
  skills_added: number;
  skills_skipped: number;
}

const MAX_FILE_BYTES = 7 * 1024 * 1024; // 7MB — server allows ~7.5MB after base64 overhead

/** Converts a selected resume file into the API parse payload. */
export async function fileToParsePayload(file: File): Promise<ParseResumePayload> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('File is too large (max 7MB).');
  }
  const name = file.name.toLowerCase();
  if (name.endsWith('.txt') || name.endsWith('.md') || file.type === 'text/plain') {
    return { filename: file.name, text: await file.text() };
  }
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = () => reject(new Error('Could not read the selected file.'));
      reader.readAsDataURL(file);
    });
    return { filename: file.name, content_base64: base64 };
  }
  throw new Error('Unsupported file type — use PDF, TXT, or MD, or paste your resume text.');
}
