import { Ionicons } from '@expo/vector-icons';

import { Palette, Tint } from '@/constants/palette';

type IoniconName = keyof typeof Ionicons.glyphMap;

export type CategoryId =
  | 'student'
  | 'employee'
  | 'teacher'
  | 'freelancer'
  | 'business'
  | 'developer'
  | 'doctor'
  | 'designer'
  | 'homemaker'
  | 'other';

export type CategoryDef = {
  id: CategoryId;
  label: string;
  blurb: string;
  icon: IoniconName;
  color: string;
  tint: string;
  /** Dashboard sections shown for this persona. */
  widgets: string[];
};

export const CATEGORIES: CategoryDef[] = [
  { id: 'student', label: 'Student', blurb: 'Classes, assignments & exams', icon: 'school', color: Palette.primary, tint: Tint.primary, widgets: ['Class Schedule', 'Assignments', 'Study Planner', 'Exam Countdown'] },
  { id: 'employee', label: 'Employee', blurb: 'Meetings, projects & tasks', icon: 'briefcase', color: Palette.blue, tint: Tint.blue, widgets: ['Meetings', 'Office Schedule', 'Projects', 'Work Tasks'] },
  { id: 'teacher', label: 'Teacher', blurb: 'Lectures, students & grading', icon: 'easel', color: Palette.green, tint: Tint.green, widgets: ['Lecture Schedule', 'Students', 'Assignments', 'Classes'] },
  { id: 'freelancer', label: 'Freelancer', blurb: 'Clients, projects & invoices', icon: 'laptop', color: Palette.orange, tint: Tint.orange, widgets: ['Clients', 'Projects', 'Invoices', 'Deadlines'] },
  { id: 'business', label: 'Business Owner', blurb: 'Sales, team & operations', icon: 'stats-chart', color: Palette.pink, tint: Tint.pink, widgets: ['Meetings', 'Sales', 'Inventory', 'Employees'] },
  { id: 'developer', label: 'Developer', blurb: 'Sprints, code & deployments', icon: 'code-slash', color: Palette.primary, tint: Tint.primary, widgets: ['Coding Tasks', 'GitHub', 'Sprint', 'Deployments'] },
  { id: 'doctor', label: 'Doctor', blurb: 'Appointments & patients', icon: 'medkit', color: Palette.blue, tint: Tint.blue, widgets: ['Appointments', 'Patients', 'Hospital Schedule'] },
  { id: 'designer', label: 'Designer', blurb: 'Projects, clients & assets', icon: 'color-palette', color: Palette.pink, tint: Tint.pink, widgets: ['Projects', 'Clients', 'Assets', 'Deadlines'] },
  { id: 'homemaker', label: 'Homemaker', blurb: 'Home, chores & family', icon: 'home', color: Palette.green, tint: Tint.green, widgets: ['Daily Routine', 'Chores', 'Shopping', 'Family'] },
  { id: 'other', label: 'Other', blurb: 'A planner tailored to you', icon: 'sparkles', color: Palette.secondary, tint: Tint.primary, widgets: ['Tasks', 'Schedule', 'Goals', 'Reminders'] },
];

export function getCategory(id: CategoryId | undefined | null): CategoryDef {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

/* -------------------------------------------------------------------------- */
/* Add-entry form config (per category)                                       */
/* -------------------------------------------------------------------------- */

/** One text field on the Add screen. */
export type EntryField = {
  label: string;
  placeholder: string;
  icon: IoniconName;
};

/**
 * Drives the Add screen (app/add-class.tsx). The screen keeps a common shape
 * (a main "subject" field, a "person" field, a "place" field + day/time/etc.)
 * but the wording changes per persona so it makes sense for each user.
 */
export type AddEntryConfig = {
  /** Header title, e.g. "Add Class". */
  title: string;
  /** Save button label, e.g. "Save Class". */
  saveLabel: string;
  subject: EntryField;
  person: EntryField;
  place: EntryField;
};

export const ADD_ENTRY_CONFIG: Record<CategoryId, AddEntryConfig> = {
  student: {
    title: 'Add Class',
    saveLabel: 'Save Class',
    subject: { label: 'Subject', placeholder: 'e.g. Mathematics', icon: 'book-outline' },
    person: { label: 'Teacher', placeholder: 'e.g. Mr. Khan', icon: 'person-outline' },
    place: { label: 'Room', placeholder: 'e.g. Class Room 2', icon: 'location-outline' },
  },
  employee: {
    title: 'Add Meeting',
    saveLabel: 'Save Meeting',
    subject: { label: 'Title', placeholder: 'e.g. Sprint Planning', icon: 'briefcase-outline' },
    person: { label: 'Attendees', placeholder: 'e.g. Team / Manager', icon: 'people-outline' },
    place: { label: 'Location', placeholder: 'e.g. Conference Room A', icon: 'location-outline' },
  },
  teacher: {
    title: 'Add Lecture',
    saveLabel: 'Save Lecture',
    subject: { label: 'Subject', placeholder: 'e.g. Physics', icon: 'book-outline' },
    person: { label: 'Class / Section', placeholder: 'e.g. Grade 10-B', icon: 'people-outline' },
    place: { label: 'Room', placeholder: 'e.g. Room 12', icon: 'location-outline' },
  },
  freelancer: {
    title: 'Add Session',
    saveLabel: 'Save Session',
    subject: { label: 'Project', placeholder: 'e.g. Landing Page', icon: 'laptop-outline' },
    person: { label: 'Client', placeholder: 'e.g. Acme Co.', icon: 'person-outline' },
    place: { label: 'Location / Link', placeholder: 'e.g. Zoom call', icon: 'location-outline' },
  },
  business: {
    title: 'Add Meeting',
    saveLabel: 'Save Meeting',
    subject: { label: 'Title', placeholder: 'e.g. Sales Review', icon: 'stats-chart-outline' },
    person: { label: 'With', placeholder: 'e.g. Team / Client', icon: 'people-outline' },
    place: { label: 'Location', placeholder: 'e.g. Head Office', icon: 'location-outline' },
  },
  developer: {
    title: 'Add Task',
    saveLabel: 'Save Task',
    subject: { label: 'Task', placeholder: 'e.g. Fix login bug', icon: 'code-slash-outline' },
    person: { label: 'Project / Repo', placeholder: 'e.g. app-frontend', icon: 'git-branch-outline' },
    place: { label: 'Link / Ref', placeholder: 'e.g. Jira #123', icon: 'link-outline' },
  },
  doctor: {
    title: 'Add Appointment',
    saveLabel: 'Save Appointment',
    subject: { label: 'Purpose', placeholder: 'e.g. Consultation', icon: 'medkit-outline' },
    person: { label: 'Patient', placeholder: 'e.g. John Doe', icon: 'person-outline' },
    place: { label: 'Room / Clinic', placeholder: 'e.g. Room 3', icon: 'location-outline' },
  },
  designer: {
    title: 'Add Session',
    saveLabel: 'Save Session',
    subject: { label: 'Project', placeholder: 'e.g. Brand Kit', icon: 'color-palette-outline' },
    person: { label: 'Client', placeholder: 'e.g. Acme Co.', icon: 'person-outline' },
    place: { label: 'Location / Link', placeholder: 'e.g. Figma file', icon: 'location-outline' },
  },
  homemaker: {
    title: 'Add Activity',
    saveLabel: 'Save Activity',
    subject: { label: 'Activity', placeholder: 'e.g. Grocery Shopping', icon: 'home-outline' },
    person: { label: 'With', placeholder: 'e.g. Family', icon: 'people-outline' },
    place: { label: 'Place', placeholder: 'e.g. Market', icon: 'location-outline' },
  },
  other: {
    title: 'Add Event',
    saveLabel: 'Save Event',
    subject: { label: 'Title', placeholder: 'e.g. Appointment', icon: 'calendar-outline' },
    person: { label: 'With', placeholder: 'e.g. Someone', icon: 'person-outline' },
    place: { label: 'Location', placeholder: 'e.g. Somewhere', icon: 'location-outline' },
  },
};

export function getAddEntryConfig(id: CategoryId | undefined | null): AddEntryConfig {
  return (id && ADD_ENTRY_CONFIG[id]) || ADD_ENTRY_CONFIG.other;
}
