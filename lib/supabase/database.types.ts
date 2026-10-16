/**
 * Hand-written equivalent of `supabase gen types typescript` for supabase/schema.sql.
 * KEEP IN SYNC with schema.sql (tables, enums, RPC signatures). `npm run db:check` does not verify this file.
 *
 * Conventions: `L` = localized JSONB `{uz, ru, en}`; timestamps are ISO strings; numeric columns are numbers.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Localized text stored in JSONB columns. */
export type L = { uz?: string; ru?: string; en?: string };

type Table<Row, Required extends keyof Row = never> = {
  Row: Row;
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>;
  Update: Partial<Row>;
  Relationships: [];
};

export type UserRole = "super_admin" | "methodist" | "psychologist" | "teacher" | "student" | "school_admin" | "parent";
export type GradeCategory = "primary" | "middle" | "high";
export type DifficultyLevel = "easy" | "medium" | "hard";
export type RegistrationStatus = "pending" | "confirmed" | "attended" | "disqualified";
export type ApplicationStatus = "new" | "contacted" | "interview_scheduled" | "accepted" | "rejected";
export type PsychAudience = "kids" | "teens" | "older" | "parents";
export type PsychTopic = "interests" | "temperament" | "career" | "readiness" | "emotional";
export type ApplicationType = "admission" | "campus_tour" | "callback";
export type AchievementCategory = "olympiad" | "sport" | "art" | "graduate";
export type LocaleCode = "uz" | "ru" | "en";

type SubjectEntry = { key: string; name: L };
type QuizOption = { id: string; text: L };
type PsychOption = { id: string; text: L; score: number };

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        {
          id: string;
          full_name: string;
          role: UserRole;
          phone: string | null;
          avatar_url: string | null;
          grade: number | null;
          is_active: boolean;
          must_change_password: boolean;
          created_at: string;
          updated_at: string;
        },
        "id"
      >;
      site_settings: Table<
        {
          id: number;
          school_name: L;
          hero_title: L;
          hero_subtitle: L;
          hero_video_url: string | null;
          hero_image_url: string | null;
          about_mission: L;
          about_vision: L;
          about_history: L;
          stats: Array<{ key: string; value: number; suffix?: string; label: L }>;
          address: L;
          landmark: L;
          phones: string[];
          email: string | null;
          working_hours: L;
          map_lat: number | null;
          map_lng: number | null;
          map_embed_url: string | null;
          social_links: Partial<Record<"telegram" | "instagram" | "youtube" | "facebook", string>>;
          virtual_tour_url: string | null;
          created_at: string;
          updated_at: string;
        }
      >;
      programs: Table<
        {
          id: string;
          category: GradeCategory;
          grade_range: string;
          title: L;
          short_description: L;
          full_content: L;
          subjects: SubjectEntry[];
          icon_name: string | null;
          cover_image_url: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
        "category"
      >;
      campus_life: Table<
        {
          id: string;
          section_key: string;
          title: L;
          description: L;
          gallery_urls: string[];
          extra_data: Json;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
        "section_key"
      >;
      staff_members: Table<
        {
          id: string;
          is_administration: boolean;
          full_name: L;
          position: L;
          subject_key: string | null;
          bio: L;
          experience_years: number | null;
          certificates: string[];
          photo_url: string | null;
          intro_video_url: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        }
      >;
      student_achievements: Table<
        {
          id: string;
          student_name: L;
          grade_or_grad_year: string | null;
          achievement_title: L;
          description: L;
          university_accepted: L | null;
          photo_url: string | null;
          certificate_url: string | null;
          category: AchievementCategory;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        }
      >;
      olympiads: Table<
        {
          id: string;
          title: L;
          description: L;
          rules: L | null;
          subjects: SubjectEntry[];
          eligible_grades: number[];
          event_date: string;
          registration_deadline: string;
          location: L;
          cover_image_url: string | null;
          is_registration_open: boolean;
          is_results_published: boolean;
          created_at: string;
          updated_at: string;
        },
        "event_date" | "registration_deadline"
      >;
      olympiad_registrations: Table<
        {
          id: string;
          olympiad_id: string;
          ticket_number: string;
          student_full_name: string;
          birth_date: string;
          current_school: string;
          grade: number;
          subject_key: string;
          parent_phone: string;
          extra_phone: string | null;
          qr_code_payload: string | null;
          status: RegistrationStatus;
          score: number | null;
          max_score: number;
          rank_place: number | null;
          certificate_pdf_url: string | null;
          created_at: string;
          updated_at: string;
        },
        "olympiad_id" | "student_full_name" | "birth_date" | "current_school" | "grade" | "subject_key" | "parent_phone"
      >;
      academic_quizzes: Table<
        {
          id: string;
          title: L;
          description: L | null;
          subject_key: string;
          subject_name: L;
          grade: number;
          difficulty: DifficultyLevel;
          duration_minutes: number;
          passing_score_percent: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
        "subject_key" | "grade"
      >;
      academic_questions: Table<
        {
          id: string;
          quiz_id: string;
          question_text: L;
          question_image_url: string | null;
          options: QuizOption[];
          correct_option_id: string;
          explanation: L | null;
          points: number;
          sort_order: number;
          created_at: string;
          updated_at: string;
        },
        "quiz_id" | "correct_option_id"
      >;
      academic_quiz_attempts: Table<
        {
          id: string;
          quiz_id: string;
          student_name: string;
          student_grade: number | null;
          parent_phone: string | null;
          total_questions: number;
          correct_answers: number;
          score_percent: number;
          time_spent_seconds: number | null;
          answers_log: Json;
          created_at: string;
        },
        "quiz_id" | "student_name"
      >;
      psych_tests: Table<
        {
          id: string;
          title: L;
          description: L;
          instruction: L;
          target_audience: PsychAudience;
          topic: PsychTopic | null;
          cover_image_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        }
      >;
      psych_questions: Table<
        {
          id: string;
          psych_test_id: string;
          question_text: L;
          question_image_url: string | null;
          options: PsychOption[];
          sort_order: number;
          created_at: string;
          updated_at: string;
        },
        "psych_test_id"
      >;
      psych_result_scales: Table<
        {
          id: string;
          psych_test_id: string;
          min_score: number;
          max_score: number;
          result_title: L;
          psychological_analysis: L;
          recommendations_for_parents: L;
          badge_color: string;
          created_at: string;
          updated_at: string;
        },
        "psych_test_id" | "min_score" | "max_score"
      >;
      psych_test_submissions: Table<
        {
          id: string;
          psych_test_id: string;
          student_name: string;
          student_age: number | null;
          parent_phone: string | null;
          total_score: number;
          matched_scale_id: string | null;
          answers_log: Json;
          created_at: string;
        },
        "psych_test_id" | "student_name"
      >;
      brain_games: Table<
        {
          id: string;
          game_slug: string;
          title: L;
          description: L;
          how_to_play: L;
          cognitive_skill: L;
          icon_name: string | null;
          config: Partial<Record<DifficultyLevel, { grid?: number; time_limit?: number; multiplier?: number }>>;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        },
        "game_slug"
      >;
      game_leaderboard: Table<
        {
          id: string;
          game_id: string;
          player_name: string;
          student_grade: number | null;
          difficulty: DifficultyLevel;
          score: number;
          completion_time_ms: number | null;
          accuracy_percent: number | null;
          created_at: string;
        },
        "game_id" | "player_name" | "score"
      >;
      admission_applications: Table<
        {
          id: string;
          application_type: ApplicationType;
          parent_name: string;
          child_name: string | null;
          target_grade: number | null;
          phone: string;
          preferred_language: LocaleCode | null;
          message: string | null;
          status: ApplicationStatus;
          admin_notes: string | null;
          created_at: string;
          updated_at: string;
        },
        "parent_name" | "phone"
      >;
      site_visits: Table<
        {
          id: number;
          path: string;
          locale: LocaleCode | null;
          created_at: string;
        },
        "path"
      >;
      audit_log: Table<
        {
          id: number;
          user_id: string | null;
          user_email: string | null;
          action: string;
          resource: string;
          record_id: string | null;
          diff: Json | null;
          created_at: string;
        },
        "action" | "resource"
      >;
      rate_limits: Table<
        {
          key: string;
          window_start: string;
          hits: number;
        },
        "key" | "window_start"
      >;
    };
    Views: Record<string, never>;
    Functions: {
      has_role: { Args: { p_roles: string[] }; Returns: boolean };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      register_olympiad: {
        Args: {
          p_olympiad_id: string;
          p_student_full_name: string;
          p_birth_date: string;
          p_current_school: string;
          p_grade: number;
          p_subject_key: string;
          p_parent_phone: string;
          p_extra_phone?: string | null;
        };
        Returns: OlympiadPass;
      };
      check_olympiad_result: { Args: { p_ticket: string }; Returns: OlympiadResult | null };
      olympiad_leaderboard: { Args: { p_olympiad_id: string }; Returns: OlympiadLeaderRow[] };
      list_quizzes: { Args: Record<string, never>; Returns: QuizListItem[] };
      get_quiz_questions: { Args: { p_quiz_id: string }; Returns: QuizQuestionPublic[] };
      submit_quiz_attempt: {
        Args: {
          p_quiz_id: string;
          p_answers: Record<string, string>;
          p_student_name: string;
          p_student_grade?: number | null;
          p_parent_phone?: string | null;
          p_time_spent_seconds?: number | null;
        };
        Returns: QuizSubmitResult;
      };
      list_psych_tests: { Args: Record<string, never>; Returns: PsychTestPublic[] };
      get_psych_test: { Args: { p_test_id: string }; Returns: PsychTestPublic | null };
      get_psych_questions: { Args: { p_test_id: string }; Returns: PsychQuestionPublic[] };
      submit_psych_test: {
        Args: {
          p_test_id: string;
          p_answers: Record<string, string>;
          p_student_name?: string | null;
          p_student_age?: number | null;
          p_parent_phone?: string | null;
        };
        Returns: PsychSubmitResult;
      };
      get_leaderboard: {
        Args: { p_game_slug: string; p_difficulty?: string | null; p_limit?: number };
        Returns: Database["public"]["Tables"]["game_leaderboard"]["Row"][];
      };
      /** service_role only. Returns TRUE when the hit is allowed, FALSE when over the limit. */
      rate_limit_hit: { Args: { key: string; max: number; window_seconds: number }; Returns: boolean };
      /** service_role only. */
      purge_old_data: {
        Args: { p_visit_days?: number; p_audit_days?: number; p_notification_days?: number; p_attempt_days?: number | null; p_batch?: number };
        Returns: { site_visits: number; rate_limits: number; audit_log: number; notifications: number; quiz_attempts: number; psych_submissions: number };
      };
    };
    Enums: {
      user_role: UserRole;
      grade_category: GradeCategory;
      difficulty_level: DifficultyLevel;
      registration_status: RegistrationStatus;
      application_status: ApplicationStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};

/* ---- RPC payloads (jsonb) ---- */

export type OlympiadPass = {
  ticket_number: string;
  qr_code_payload: string;
  student_full_name: string;
  birth_date: string;
  current_school: string;
  grade: number;
  subject_key: string;
  status: RegistrationStatus;
  created_at: string;
  olympiad: { id: string; title: L; event_date: string; location: L };
};

export type OlympiadResult = {
  ticket_number: string;
  student_full_name: string;
  subject_key: string;
  grade: number;
  status: RegistrationStatus;
  olympiad_title: L;
  results_published: boolean;
  /** null unless results_published */
  score: number | null;
  max_score: number | null;
  rank_place: number | null;
};

export type OlympiadLeaderRow = {
  student_full_name: string;
  subject_key: string;
  score: number;
  max_score: number;
  rank_place: number;
};

export type QuizListItem = {
  id: string;
  title: L;
  description: L | null;
  subject_key: string;
  subject_name: L;
  grade: number;
  difficulty: DifficultyLevel;
  duration_minutes: number;
  passing_score_percent: number;
  question_count: number;
};

export type QuizQuestionPublic = {
  id: string;
  question_text: L;
  question_image_url: string | null;
  options: QuizOption[];
  points: number;
  sort_order: number;
};

export type QuizSubmitResult = {
  quiz_id: string;
  total: number;
  correct: number;
  score_percent: number;
  passed: boolean;
  passing_score_percent: number;
  results: Array<{
    question_id: string;
    selected_option_id: string | null;
    correct: boolean;
    correct_option_id: string;
    explanation: L | null;
  }>;
};

export type PsychQuestionPublic = {
  id: string;
  question_text: L;
  question_image_url: string | null;
  options: Array<{ id: string; text: L }>;
  sort_order: number;
};

export type PsychTestPublic = {
  id: string;
  title: L;
  description: L;
  instruction: L;
  target_audience: PsychAudience;
  topic: PsychTopic | null;
  cover_image_url: string | null;
  question_count?: number;
  questions: PsychQuestionPublic[];
};

export type PsychSubmitResult = {
  total_score: number;
  max_score: number;
  target_audience: PsychAudience;
  topic: PsychTopic | null;
  scale: null | {
    id: string;
    result_title: L;
    psychological_analysis: L;
    recommendations_for_parents: L;
    badge_color: string;
  };
};

/** Stable error codes raised by the RPCs (exception message). */
export type RpcErrorCode =
  | "invalid_input"
  | "not_found"
  | "registration_closed"
  | "grade_not_eligible"
  | "invalid_subject"
  | "already_registered"
  | "too_many_registrations"
  | "ticket_generation_failed";

export type TableName = keyof Database["public"]["Tables"];
export type Row<T extends TableName> = Database["public"]["Tables"][T]["Row"];
export type InsertRow<T extends TableName> = Database["public"]["Tables"][T]["Insert"];
