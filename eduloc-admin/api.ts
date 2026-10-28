/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User, TutorProfile, Booking, Message, Conversation, Review, BookingType, BookingStatus, TeachingMode, AppNotification, NotificationType, OfferData } from '../types';

// --- API RESPONSE FORMAT HELPERS ---

export interface TutorProfileWithUser extends TutorProfile {
  user: User;
}

export interface BookingWithDetails extends Booking {
  apprentice: User;
  tutorUser: User;
  tutorProfile: TutorProfile;
}

export interface ConversationWithPartner extends Conversation {
  partner: User;
}

// --- TOKEN & CLIENT CONFIGURATION ---

const API_BASE_URL = ((import.meta as any).env?.VITE_API_URL as string) || 'http://localhost:3000';
const ACCESS_TOKEN_KEY = 'eduloc_access_token';
const REFRESH_TOKEN_KEY = 'eduloc_refresh_token';

export const getAccessToken = (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY);
export const getRefreshToken = (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY);

export const setTokens = (accessToken: string, refreshToken?: string) => {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
};

export const clearTokens = () => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearTokens();
      return false;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (res.ok) {
        const refreshData = await res.json();
        const payload = refreshData.data !== undefined ? refreshData.data : refreshData;
        if (payload.accessToken) {
          setTokens(payload.accessToken, payload.refreshToken);
          return true;
        }
      }
    } catch (err) {
      console.error('[API] Refresh token request failed:', err);
    } finally {
      refreshPromise = null;
    }

    clearTokens();
    return false;
  })();

  return refreshPromise;
}

// --- HTTP REQUEST HELPER WITH UNWRAPPING, 401 REFRESH & DEV FALLBACK ---

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  isRetry = false
): Promise<T> {
  const token = getAccessToken();
  // FormData bodies (file uploads) must NOT get a manual Content-Type: the
  // browser sets multipart/form-data with the correct boundary itself.
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const res = await fetch(url, { ...options, headers });

    // Handle 401 Token Expiration -> Single-Flight Auto Refresh
    if (
      res.status === 401 &&
      !isRetry &&
      endpoint !== '/auth/refresh' &&
      endpoint !== '/auth/login' &&
      endpoint !== '/auth/register'
    ) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return request<T>(endpoint, options, true);
      }
    }

    if (!res.ok) {
      const errorJson = await res.json().catch(() => ({}));
      let msg = `Request failed with status ${res.status}`;

      if (typeof errorJson.message === 'string') {
        msg = errorJson.message;
      } else if (Array.isArray(errorJson.message)) {
        msg = errorJson.message.map((m: any) => (typeof m === 'object' ? JSON.stringify(m) : String(m))).join(', ');
      } else if (errorJson.message && typeof errorJson.message === 'object') {
        msg = errorJson.message.message || JSON.stringify(errorJson.message);
      } else if (typeof errorJson.error === 'string') {
        msg = errorJson.error;
      } else if (typeof errorJson === 'string') {
        msg = errorJson;
      }

      throw new Error(msg);
    }

    const resJson = await res.json();
    // Unwrap NestJS TransformInterceptor: { statusCode, data, message, timestamp }
    return resJson.data !== undefined ? resJson.data : resJson;
  } catch (error) {
    throw error;
  }
}

// --- LOCAL STORAGE ENGINE ---

const LOCAL_STORAGE_BOOKINGS_KEY = 'eduloc_bookings_store_v1';
const LOCAL_STORAGE_CONVERSATIONS_KEY = 'eduloc_conversations_store_v1';
const LOCAL_STORAGE_MESSAGES_KEY = 'eduloc_messages_store_v1';
const LOCAL_STORAGE_REVIEWS_KEY = 'eduloc_reviews_store_v1';

/* DEFAULT_SAMPLE_REVIEWS removed — no sample reviews by default */

function getStoredReviews(tutorId?: string): Review[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_REVIEWS_KEY);
    let reviewsList: Review[];
    if (!raw) {
      reviewsList = [];
    } else {
      reviewsList = JSON.parse(raw);
    }
    if (tutorId) {
      const filtered = reviewsList.filter(r => 
        r.tutorId === tutorId || 
        ((tutorId === 'user-tut-1' || tutorId === 'tutor-prof-1') && (r.tutorId === 'user-tut-1' || r.tutorId === 'tutor-prof-1'))
      );
      if (filtered.length > 0) return filtered;
      // No fallback samples: return empty array when no reviews yet
      return [];
    }
    return reviewsList;
  } catch (e) {
    return [];
  }
}

function saveStoredReviews(reviews: Review[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_REVIEWS_KEY, JSON.stringify(reviews));
  } catch (e) {
    console.warn('[API] Failed to save reviews to localStorage:', e);
  }
}

/* DEFAULT_SAMPLE_BOOKINGS removed — no sample bookings by default */

function getStoredBookings(): BookingWithDetails[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_BOOKINGS_KEY);
    if (!raw) {
      return [];
    }
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveStoredBookings(bookings: BookingWithDetails[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_BOOKINGS_KEY, JSON.stringify(bookings));
  } catch (e) {
    console.warn('[API] Failed to save bookings to localStorage:', e);
  }
}

function getStoredConversations(): ConversationWithPartner[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CONVERSATIONS_KEY);
    if (!raw) {
      const initialConvs: ConversationWithPartner[] = [
        {
          id: 'conv-user-app-1-tutor-prof-1',
          apprenticeId: 'user-app-1',
          tutorId: 'tutor-prof-1',
          lastMessage: "Bonjour ! Merci pour la séance d'hier, c'était très clair.",
          lastSenderId: 'user-app-1',
          timestamp: '10:42',
          unreadCount: 0,
          partner: {
            id: 'tutor-prof-1',
            name: 'Jean-Sébastien R.',
            email: 'js.reynaud@example.com',
            role: 'TUTEUR',
            avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
            studyLevel: 'Tuteur Certifié EduLoc'
          }
        }
      ];
      saveStoredConversations(initialConvs);
      return initialConvs;
    }
    const parsed: ConversationWithPartner[] = JSON.parse(raw);
    const msgs = getStoredMessages();
    return parsed.map(c => {
      if (!c.lastSenderId) {
        const cMsgs = msgs.filter(m => m.conversationId === c.id);
        if (cMsgs.length > 0) {
          const lastM = cMsgs[cMsgs.length - 1];
          return { ...c, lastSenderId: lastM.senderId, lastMessage: lastM.content };
        }
        return { ...c, lastSenderId: c.apprenticeId };
      }
      return c;
    });
  } catch (e) {
    return [];
  }
}

function saveStoredConversations(conversations: ConversationWithPartner[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_CONVERSATIONS_KEY, JSON.stringify(conversations));
  } catch (e) {
    console.warn('[API] Failed to save conversations to localStorage:', e);
  }
}

function getStoredMessages(): Message[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_MESSAGES_KEY);
    if (!raw) {
      const initialMsgs: Message[] = [
        {
          id: 'msg-demo-1',
          conversationId: 'conv-user-app-1-tutor-prof-1',
          senderId: 'tutor-prof-1',
          content: 'Bonjour ! Êtes-vous prêt pour la session de révision de Mathématiques ?',
          timestamp: '10:30',
          status: 'sent'
        },
        {
          id: 'msg-demo-2',
          conversationId: 'conv-user-app-1-tutor-prof-1',
          senderId: 'user-app-1',
          content: "Bonjour ! Merci pour la séance d'hier, c'était très clair.",
          timestamp: '10:42',
          status: 'sent'
        }
      ];
      saveStoredMessages(initialMsgs);
      return initialMsgs;
    }
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveStoredMessages(messages: Message[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_MESSAGES_KEY, JSON.stringify(messages));
  } catch (e) {
    console.warn('[API] Failed to save messages to localStorage:', e);
  }
}

// --- API SERVICE ---

export const apiService = {
  // --- USER & AUTHENTICATION ---

  logoutUser: async (): Promise<void> => {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch (err) {
      console.warn('[API] Logout request failed:', err);
    } finally {
      clearTokens();
    }
  },

  loginUser: async (credentials: { email: string; password: string }): Promise<{ user: User; accessToken: string; refreshToken: string }> => {
    const data = await request<{ user: User; accessToken: string; refreshToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    if (data.accessToken) {
      setTokens(data.accessToken, data.refreshToken);
    }
    return data;
  },

  getCurrentUser: async (_role?: 'APPRENTI' | 'TUTEUR'): Promise<User> => {
    return await request<User>('/users/me');
  },

  getUserById: async (id: string): Promise<User> => {
    return await request<User>(`/users/${id}`);
  },

  registerUser: async (userData: { name: string; email: string; role: 'APPRENTI' | 'TUTEUR'; phone?: string; password?: string }): Promise<User> => {
    const result = await request<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: userData.name,
        email: userData.email,
        password: userData.password || 'Password123!',
        role: userData.role,
        phone: userData.phone,
      }),
    });
    if (result.accessToken) {
      setTokens(result.accessToken, result.refreshToken);
    }
    return result.user || result;
  },

  updateActiveRole: async (activeRole: 'NONE' | 'APPRENTI' | 'TUTEUR'): Promise<User | null> => {
    return await request<User>('/users/me/active-role', {
      method: 'PATCH',
      body: JSON.stringify({ activeRole }),
    });
  },

  updateUserActiveRole: async (id: string, activeRole: 'NONE' | 'APPRENTI' | 'TUTEUR'): Promise<User | null> => {
    return await request<User>(`/users/${id}/active-role`, {
      method: 'PATCH',
      body: JSON.stringify({ activeRole }),
    });
  },

  updateMyProfile: async (data: Partial<{ name: string; avatar: string; phone: string; studyLevel: string }>): Promise<User> => {
    return await request<User>('/users/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  updateUserProfile: async (id: string, data: Partial<{ name: string; avatar: string; phone: string; studyLevel: string }>): Promise<User> => {
    return await request<User>(`/users/${id}/profile`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  uploadAvatar: async (file: File): Promise<User> => {
    const formData = new FormData();
    formData.append('avatar', file);
    return await request<User>('/users/me/avatar', {
      method: 'POST',
      body: formData,
    });
  },

  deleteAvatar: async (): Promise<User> => {
    return await request<User>('/users/me/avatar', {
      method: 'DELETE',
    });
  },

  setupApprenticeProfile: async (
    data: { defaultSearchRadius?: number; studyLevel?: string; phone?: string; latitude?: number; longitude?: number }
  ): Promise<User | null> => {
    return await request<User>('/apprentices/setup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  setupApprenticeProfileById: async (
    id: string,
    data: { defaultSearchRadius?: number; studyLevel?: string; phone?: string; latitude?: number; longitude?: number }
  ): Promise<User | null> => {
    return await request<User>(`/apprentices/${id}/setup`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  setupTutorProfile: async (
    _userId: string,
    data: {
      subjects: string[];
      rate: number;
      bio: string;
      availability: string[];
      locationLabel?: string;
      latitude?: number;
      longitude?: number;
    }
  ): Promise<TutorProfile> => {
    let profile: TutorProfile;
    try {
      profile = await request<TutorProfile>('/tutors/setup', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (err) {
      console.warn('[API] setupTutorProfile request failed, using local profile fallback:', err);
      profile = {
        id: `tutor-prof-${_userId || Date.now()}`,
        userId: _userId,
        subjects: data.subjects,
        rate: data.rate,
        bio: data.bio,
        availability: data.availability,
        rating: 5.0,
        reviewsCount: 0,
        locationLabel: data.locationLabel || 'Ma position GPS',
        latitude: data.latitude ?? 48.8566,
        longitude: data.longitude ?? 2.3522,
        isOnline: true
      };
    }

    if (_userId) {
      localStorage.setItem(`eduloc_tutor_location_${_userId}`, JSON.stringify({
        latitude: profile.latitude ?? data.latitude,
        longitude: profile.longitude ?? data.longitude,
        locationLabel: profile.locationLabel ?? data.locationLabel
      }));
    }

    return profile;
  },

  updateTutorAvailability: async (data: string[] | {
    availability: string[];
    defaultSearchRadius?: number;
    locationLabel?: string;
    latitude?: number;
    longitude?: number;
  }): Promise<any> => {
    const payload = Array.isArray(data) ? { availability: data } : data;
    let result: any = { success: true };
    try {
      result = await request<any>('/tutors/me/availability', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.warn('[API] PATCH /tutors/me/availability failed, using client storage fallback:', err);
    }

    // Persist GPS location to client storage if present
    if (payload.latitude !== undefined && payload.longitude !== undefined) {
      try {
        const storedUser = localStorage.getItem('eduloc_access_token');
        if (storedUser) {
          const storedLoc = {
            latitude: payload.latitude,
            longitude: payload.longitude,
            locationLabel: payload.locationLabel || 'Position GPS'
          };
          localStorage.setItem('eduloc_current_tutor_gps', JSON.stringify(storedLoc));
        }
      } catch (e) {
        // ignore storage errors
      }
    }

    return result;
  },

  // --- TUTORS & SEARCH ---

  getNearbyTutors: async (
    latOrSubject?: number | string,
    lng?: number,
    radiusKm?: number,
    subjectFilter?: string
  ): Promise<TutorProfileWithUser[]> => {
    const params = new URLSearchParams();
    if (typeof latOrSubject === 'number') {
      params.append('lat', latOrSubject.toString());
      if (lng !== undefined) params.append('lng', lng.toString());
      if (radiusKm !== undefined) params.append('radiusKm', radiusKm.toString());
      if (subjectFilter) params.append('subjectFilter', subjectFilter);
    } else if (typeof latOrSubject === 'string') {
      params.append('subjectFilter', latOrSubject);
    }

    const queryString = params.toString();
    const endpoint = `/tutors/nearby${queryString ? '?' + queryString : ''}`;
    let profiles: any[] = [];
    try {
      profiles = await request<any[]>(endpoint);
    } catch (err) {
      console.warn('[API] getNearbyTutors request failed:', err);
      profiles = [];
    }

    return profiles.map(p => {
      const uId = p.userId || p.user?.id;
      let lat = p.latitude;
      let lng = p.longitude;
      let label = p.locationLabel;

      if (uId) {
        const storedLoc = localStorage.getItem(`eduloc_tutor_location_${uId}`);
        if (storedLoc) {
          try {
            const parsed = JSON.parse(storedLoc);
            if (parsed.latitude !== undefined) lat = parsed.latitude;
            if (parsed.longitude !== undefined) lng = parsed.longitude;
            if (parsed.locationLabel) label = parsed.locationLabel;
          } catch (e) {}
        }
      }

      return {
        ...p,
        latitude: lat ?? p.latitude,
        longitude: lng ?? p.longitude,
        locationLabel: label ?? p.locationLabel,
        rate: Number(p.rate),
        user: p.user
      };
    });
  },

  getTutorProfile: async (tutorId: string): Promise<TutorProfileWithUser | null> => {
    let profile: any = null;
    try {
      profile = await request<any>(`/tutors/${tutorId}`);
    } catch (e) {
      console.warn('[API] getTutorProfile request failed:', e);
    }

    if (!profile) return null;

    const uId = profile.userId || profile.user?.id || tutorId;
    let lat = profile.latitude;
    let lng = profile.longitude;
    let label = profile.locationLabel;
    let radius = profile.defaultSearchRadius;

    if (uId) {
      const storedLoc = localStorage.getItem(`eduloc_tutor_location_${uId}`);
      if (storedLoc) {
        try {
          const parsed = JSON.parse(storedLoc);
          if (parsed.latitude !== undefined) lat = parsed.latitude;
          if (parsed.longitude !== undefined) lng = parsed.longitude;
          if (parsed.locationLabel) label = parsed.locationLabel;
          if (parsed.defaultSearchRadius !== undefined) radius = parsed.defaultSearchRadius;
        } catch (e) {}
      }
    }

    return {
      ...profile,
      latitude: lat ?? profile.latitude,
      longitude: lng ?? profile.longitude,
      locationLabel: label ?? profile.locationLabel,
      defaultSearchRadius: radius,
      rate: Number(profile.rate),
      user: profile.user
    };
  },

  getTutorReviews: async (tutorId: string): Promise<Review[]> => {
    try {
      const reviews = await request<any[]>(`/tutors/${tutorId}/reviews`);
      if (Array.isArray(reviews)) {
        return reviews.map(r => ({
          id: r.id,
          tutorId: r.tutorId,
          apprenticeId: r.apprenticeId,
          apprenticeName: r.apprentice?.name || 'Apprenti',
          apprenticeAvatar: r.apprentice?.avatar || 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150',
          rating: r.rating,
          text: r.text,
          timestamp: new Date(r.createdAt || Date.now()).toLocaleDateString('fr-FR'),
          officialReply: r.officialReply
        }));
      }
    } catch (err) {
      console.warn('[API] getTutorReviews request failed, falling back to local reviews:', err);
    }
    return getStoredReviews(tutorId);
  },

  toggleTutorOnline: async (_tutorId: string, _isOnline: boolean): Promise<boolean> => {
    await request(`/tutors/me/online`, {
      method: 'PATCH',
      body: JSON.stringify({ isOnline: _isOnline }),
    });
    return true;
  },

  // --- BOOKINGS & TRANSACTIONS ---

  getBookings: async (role: 'APPRENTI' | 'TUTEUR'): Promise<BookingWithDetails[]> => {
    try {
      const bookings = await request<any[]>(`/bookings/me?role=${role}`);
      if (Array.isArray(bookings) && bookings.length > 0) {
        return bookings.map(b => {
          const parsedDate = new Date(b.date);
          return {
            ...b,
            date: isNaN(parsedDate.getTime())
              ? b.date
              : parsedDate.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
            price: Number(b.price),
            otpPin: b.startOtp,
            apprentice: b.apprentice,
            tutorUser: b.tutorProfile?.user,
            tutorProfile: b.tutorProfile ? { ...b.tutorProfile, rate: Number(b.tutorProfile.rate) } : undefined
          };
        });
      }
    } catch (err) {
      // Fallback silently to stored local bookings
    }
    return getStoredBookings();
  },

  getBusySlots: async (tutorId: string, date: string): Promise<Array<{ date: string; endDate: string }>> => {
    try {
      const res = await request<any[]>(`/bookings/busy-slots?tutorId=${encodeURIComponent(tutorId)}&date=${encodeURIComponent(date)}`);
      if (Array.isArray(res)) {
        return res.map(slot => ({
          date: slot.date || slot.start || slot.startTime,
          endDate: slot.endDate || slot.end || slot.endTime
        }));
      }
    } catch (err) {
      console.warn('[API] getBusySlots request failed, checking local store:', err);
    }

    // Fallback logic for offline / local state
    const stored = getStoredBookings();
    const busySlots: Array<{ date: string; endDate: string }> = [];

    for (const b of stored) {
      const isMatchTutor = b.tutorId === tutorId || b.tutorProfile?.id === tutorId || b.tutorUser?.id === tutorId;
      if (isMatchTutor && b.status !== 'CANCELLED' && b.status !== 'DECLINED' && b.status !== 'REJECTED') {
        try {
          const bDate = new Date(b.date);
          if (!isNaN(bDate.getTime())) {
            const bDateStr = bDate.toISOString().split('T')[0];
            if (bDateStr === date) {
              const durationMs = (b.durationMinutes || 60) * 60 * 1000;
              const endDate = new Date(bDate.getTime() + durationMs).toISOString();
              busySlots.push({
                date: bDate.toISOString(),
                endDate
              });
            }
          }
        } catch (e) {
          // ignore invalid date strings
        }
      }
    }

    return busySlots;
  },

  createBooking: async (bookingData: {
    apprenticeId: string;
    apprenticeUser?: User;
    tutorId: string;
    tutorUser?: User;
    tutorProfile?: TutorProfile;
    subject: string;
    date: string;
    durationMinutes?: number;
    type: BookingType;
    price: number;
    teachingMode?: TeachingMode;
    locationAddress?: string | null;
    notes?: string | null;
    locationLabel?: string;
  }): Promise<BookingWithDetails> => {
    let result: any = null;
    const teachingMode = bookingData.teachingMode || 'AT_HOME_APPRENTICE';
    const locationAddress = bookingData.locationAddress ?? null;
    const notes = bookingData.notes ?? null;
    const durationMinutes = bookingData.durationMinutes || 60;
    
    // Convert date to ISO string if needed
    let isoDate = bookingData.date;
    try {
      const d = new Date(bookingData.date);
      if (!isNaN(d.getTime())) {
        isoDate = d.toISOString();
      }
    } catch {
      // keep date string as is
    }

    const locationLabel = bookingData.locationLabel || (teachingMode === 'ONLINE' ? 'En ligne (Visio)' : locationAddress || 'En présentiel');

    try {
      result = await request<any>('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          tutorId: bookingData.tutorId,
          subject: bookingData.subject,
          date: isoDate,
          durationMinutes,
          price: Number(bookingData.price),
          locationLabel,
          teachingMode,
          locationAddress,
          notes,
          // Legacy/extra fields for backend backward-compatibility:
          apprenticeId: bookingData.apprenticeId,
          type: bookingData.type
        }),
      });
    } catch (err) {
      // Fallback silently to client local store
    }

    const bookingId = result?.id || `booking-${Date.now()}`;
    const generatedOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const meetingUrl = teachingMode === 'ONLINE' ? `https://meet.jit.si/eduloc-session-${bookingId.slice(-6)}` : undefined;

    const newBookingWithDetails: BookingWithDetails = {
      id: bookingId,
      apprenticeId: bookingData.apprenticeId,
      tutorId: bookingData.tutorId,
      subject: bookingData.subject,
      date: bookingData.date,
      type: bookingData.type,
      price: Number(bookingData.price),
      status: 'PENDING',
      teachingMode,
      locationAddress,
      notes,
      locationLabel: bookingData.locationLabel || (teachingMode === 'ONLINE' ? 'En ligne (Visio)' : locationAddress || 'En présentiel'),
      cancellationPolicy: "Gratuit jusqu'à 24h avant la session.",
      otpPin: generatedOtp,
      meetingUrl,
      apprentice: bookingData.apprenticeUser || {
        id: bookingData.apprenticeId,
        name: 'Étudiant',
        email: '',
        role: 'APPRENTI',
        studyLevel: 'Licence 2',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250',
        phone: '+33 6 12 34 56 78'
      },
      tutorUser: bookingData.tutorUser || {
        id: bookingData.tutorId,
        name: 'Tuteur',
        email: '',
        role: 'TUTEUR',
        avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=250'
      },
      tutorProfile: bookingData.tutorProfile || {
        id: bookingData.tutorId,
        userId: bookingData.tutorId,
        subjects: [bookingData.subject],
        rate: bookingData.price,
        bio: '',
        rating: 5.0,
        reviewsCount: 1,
        latitude: 48.8566,
        longitude: 2.3522,
        locationLabel: bookingData.locationLabel || 'Sorbonne, Paris 5e',
        availability: [bookingData.date],
        isOnline: true
      }
    };

    const current = getStoredBookings();
    saveStoredBookings([newBookingWithDetails, ...current]);

    // Automatically create or update a chat conversation for this booking
    try {
      const tutorUserId = bookingData.tutorUser?.id || bookingData.tutorId;
      const conv = await apiService.getOrCreateConversation(
        bookingData.apprenticeId,
        tutorUserId,
        bookingData.tutorUser
      );
      if (conv) {
        await apiService.sendMessage(
          conv.id,
          `Demande de réservation envoyée pour : ${bookingData.subject} (${bookingData.type === 'SPOT' ? 'Session Unique' : 'Pack 10h'}) pour le ${bookingData.date}. Total : ${bookingData.price} Ar.`,
          { senderId: bookingData.apprenticeId }
        );
      }
    } catch (e) {
      console.warn('[API] Auto conversation for booking failed:', e);
    }

    // Notify listeners so UI agendas update immediately
    window.dispatchEvent(new CustomEvent('eduloc_booking_created', { detail: newBookingWithDetails }));

    return newBookingWithDetails;
  },

  updateBookingStatus: async (bookingId: string, status: BookingStatus): Promise<boolean> => {
    try {
      await request(`/bookings/${bookingId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      // Fallback
    }

    const current = getStoredBookings();
    const updated = current.map(item => {
      if (item.id === bookingId) {
        const otpPin = item.otpPin || Math.floor(1000 + Math.random() * 9000).toString();
        const meetingUrl = item.meetingUrl || (item.teachingMode === 'ONLINE' ? `https://meet.jit.si/eduloc-session-${bookingId.slice(-6)}` : undefined);
        return { 
          ...item, 
          status,
          otpPin,
          meetingUrl
        };
      }
      return item;
    });
    saveStoredBookings(updated);
    window.dispatchEvent(new CustomEvent('eduloc_booking_updated', { detail: { bookingId, status } }));
    return true;
  },

  verifyBookingOtp: async (bookingId: string, otp: string): Promise<BookingWithDetails> => {
    let remoteRes: any = null;
    let remoteError: unknown = null;
    try {
      remoteRes = await request<any>(`/bookings/${bookingId}/verify-otp`, {
        method: 'POST',
        body: JSON.stringify({ otp }),
      });
    } catch (err) {
      remoteError = err;
    }

    if (remoteRes && remoteRes.id) {
      const updatedBooking: BookingWithDetails = {
        ...remoteRes,
        otpPin: remoteRes.startOtp,
        status: 'IN_PROGRESS',
        startedAt: remoteRes.startedAt || new Date().toISOString()
      };

      const current = getStoredBookings();
      if (current.some(b => b.id === bookingId)) {
        saveStoredBookings(current.map(item => item.id === bookingId ? updatedBooking : item));
      }

      window.dispatchEvent(new CustomEvent('eduloc_booking_updated', {
        detail: { bookingId, status: 'IN_PROGRESS', booking: updatedBooking }
      }));

      return updatedBooking;
    }

    // Backend request failed (wrong PIN, network error, etc). Only fall back to a
    // purely local booking (created while offline) — never fabricate success for a
    // booking that actually lives in the backend.
    const current = getStoredBookings();
    const existing = current.find(b => b.id === bookingId);

    if (existing) {
      if (existing.otpPin && existing.otpPin !== otp.trim()) {
        throw new Error(`Code PIN incorrect. Le code attendu est ${existing.otpPin}. Veuillez vérifier auprès de l'élève.`);
      }

      const nowIso = new Date().toISOString();
      let updatedBooking: BookingWithDetails | null = null;
      const updatedBookings = current.map(item => {
        if (item.id === bookingId) {
          updatedBooking = { ...item, status: 'IN_PROGRESS' as BookingStatus, startedAt: item.startedAt || nowIso };
          return updatedBooking;
        }
        return item;
      });
      saveStoredBookings(updatedBookings);

      window.dispatchEvent(new CustomEvent('eduloc_booking_updated', {
        detail: { bookingId, status: 'IN_PROGRESS', booking: updatedBooking }
      }));

      return updatedBooking!;
    }

    throw remoteError instanceof Error
      ? remoteError
      : new Error('Code PIN incorrect. Veuillez vérifier auprès de l\'élève.');
  },

  completeBooking: async (bookingId: string): Promise<BookingWithDetails> => {
    let remoteRes: any = null;
    let remoteError: unknown = null;
    try {
      remoteRes = await request<any>(`/bookings/${bookingId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'COMPLETED' }),
      });
    } catch (err) {
      remoteError = err;
    }

    if (remoteRes && remoteRes.id) {
      const updatedBooking: BookingWithDetails = { ...remoteRes, status: 'COMPLETED' };

      const current = getStoredBookings();
      if (current.some(b => b.id === bookingId)) {
        saveStoredBookings(current.map(item => item.id === bookingId ? updatedBooking : item));
      }

      window.dispatchEvent(new CustomEvent('eduloc_booking_updated', {
        detail: { bookingId, status: 'COMPLETED', booking: updatedBooking }
      }));

      return updatedBooking;
    }

    const current = getStoredBookings();
    let updatedBooking: BookingWithDetails | null = null;
    const updatedBookings = current.map(item => {
      if (item.id === bookingId) {
        updatedBooking = {
          ...item,
          status: 'COMPLETED' as BookingStatus
        };
        return updatedBooking;
      }
      return item;
    });

    if (!updatedBooking) {
      throw remoteError instanceof Error ? remoteError : new Error('Réservation introuvable.');
    }

    saveStoredBookings(updatedBookings);

    window.dispatchEvent(new CustomEvent('eduloc_booking_updated', {
      detail: { bookingId, status: 'COMPLETED', booking: updatedBooking }
    }));

    return updatedBooking;
  },

  updateBookingNotes: async (bookingId: string, notes: string): Promise<boolean> => {
    try {
      await request(`/bookings/${bookingId}/notes`, {
        method: 'PATCH',
        body: JSON.stringify({ notes }),
      });
    } catch (err) {
      // Fallback
    }

    const current = getStoredBookings();
    const updated = current.map(item => item.id === bookingId ? { ...item, notes } : item);
    saveStoredBookings(updated);
    window.dispatchEvent(new CustomEvent('eduloc_booking_updated', { detail: { bookingId, notes } }));
    return true;
  },

  deleteBooking: async (bookingId: string): Promise<boolean> => {
    try {
      await request(`/bookings/${bookingId}`, {
        method: 'DELETE',
      });
    } catch (err) {
      // Fallback
    }

    const current = getStoredBookings();
    const updated = current.filter(item => item.id !== bookingId);
    saveStoredBookings(updated);
    window.dispatchEvent(new CustomEvent('eduloc_booking_updated', { detail: { bookingId, action: 'deleted' } }));
    return true;
  },

  updateBookingDetails: async (
    bookingId: string, 
    details: { subject?: string; date?: string; locationLabel?: string; notes?: string }
  ): Promise<boolean> => {
    try {
      await request(`/bookings/${bookingId}`, {
        method: 'PATCH',
        body: JSON.stringify(details),
      });
    } catch (err) {
      // Fallback
    }

    const current = getStoredBookings();
    const updated = current.map(item => item.id === bookingId ? { ...item, ...details } : item);
    saveStoredBookings(updated);
    window.dispatchEvent(new CustomEvent('eduloc_booking_updated', { detail: { bookingId, details } }));
    return true;
  },

  updateBookingReminder: async (bookingId: string, reminderTime: string | null): Promise<boolean> => {
    try {
      await request(`/bookings/${bookingId}/reminder`, {
        method: 'PATCH',
        body: JSON.stringify({ reminderTime }),
      });
    } catch (err) {
      // Fallback
    }

    const current = getStoredBookings();
    const updated = current.map(item => item.id === bookingId ? { ...item, reminderTime } : item);
    saveStoredBookings(updated);
    window.dispatchEvent(new CustomEvent('eduloc_booking_updated', { detail: { bookingId, reminderTime } }));
    return true;
  },

  // --- MESSAGES & CHAT ---

  /**
   * Fetches Centrifugo JWT token for real-time WebSocket connection
   */
  getCentrifugoToken: async (userId: string): Promise<{ token: string; centrifugoUrl?: string } | null> => {
    try {
      const res = await request<any>('/chat/centrifugo-token', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      return res;
    } catch (err) {
      return null;
    }
  },

  // --- NOTIFICATIONS ---

  getNotifications: async (): Promise<any[]> => {
    try {
      const res = await request<any[]>('/notifications');
      return Array.isArray(res) ? res : [];
    } catch (e) {
      console.warn('[API] getNotifications request failed:', e);
      return [];
    }
  },

  markNotificationAsRead: async (id: string): Promise<boolean> => {
    try {
      await request<any>(`/notifications/${id}/read`, { method: 'PATCH' });
      return true;
    } catch (e) {
      console.warn('[API] markNotificationAsRead request failed:', e);
      return false;
    }
  },

  markAllNotificationsAsRead: async (): Promise<boolean> => {
    try {
      await request<any>('/notifications/read-all', { method: 'PATCH' });
      return true;
    } catch (e) {
      console.warn('[API] markAllNotificationsAsRead request failed:', e);
      return false;
    }
  },

  deleteNotification: async (id: string): Promise<boolean> => {
    try {
      await request<any>(`/notifications/${id}`, { method: 'DELETE' });
      return true;
    } catch (e) {
      console.warn('[API] deleteNotification request failed:', e);
      return false;
    }
  },

  clearAllNotifications: async (): Promise<boolean> => {
    try {
      await request<any>('/notifications/clear-all', { method: 'DELETE' });
      return true;
    } catch (e) {
      console.warn('[API] clearAllNotifications request failed:', e);
      return false;
    }
  },

  /**
   * Fetches conversations for the authenticated user.
   */
  getConversations: async (): Promise<ConversationWithPartner[]> => {
    try {
      const convs = await request<any[]>('/chat/conversations');
      if (Array.isArray(convs) && convs.length > 0) {
        return convs.map(c => ({
          id: c.id,
          apprenticeId: c.apprenticeId,
          tutorId: c.tutorId,
          lastMessage: c.lastMessage || '',
          lastSenderId: c.lastSenderId || c.senderId || c.lastMessageSenderId,
          timestamp: new Date(c.updatedAt || Date.now()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          unreadCount: c.unreadCount || 0,
          partner: c.partner
        }));
      }
    } catch {
      // Fallback
    }
    return getStoredConversations();
  },

  getOrCreateConversation: async (
    apprenticeId: string, 
    tutorUserId: string, 
    partnerDetails?: User
  ): Promise<ConversationWithPartner> => {
    try {
      const res = await request<any>('/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({ apprenticeId, tutorId: tutorUserId }),
      });
      if (res && res.id) {
        return {
          id: res.id,
          apprenticeId: res.apprenticeId || apprenticeId,
          tutorId: res.tutorId || tutorUserId,
          lastMessage: res.lastMessage || '',
          timestamp: res.timestamp || new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          unreadCount: res.unreadCount || 0,
          partner: res.partner || partnerDetails || {
            id: tutorUserId,
            name: 'Tuteur',
            email: '',
            role: 'TUTEUR',
            avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=250'
          }
        };
      }
    } catch {
      // Fallback
    }

    const storedConvs = getStoredConversations();
    let existing = storedConvs.find(c => 
      (c.apprenticeId === apprenticeId && c.tutorId === tutorUserId) ||
      (c.apprenticeId === tutorUserId && c.tutorId === apprenticeId) ||
      c.id === `conv-${apprenticeId}-${tutorUserId}` ||
      c.id === `conv-${tutorUserId}-${apprenticeId}`
    );

    if (existing) {
      if (partnerDetails && (!existing.partner || existing.partner.name === 'Tuteur')) {
        existing.partner = partnerDetails;
        saveStoredConversations(storedConvs);
      }
      return existing;
    }

    const newConv: ConversationWithPartner = {
      id: `conv-${apprenticeId}-${tutorUserId}`,
      apprenticeId,
      tutorId: tutorUserId,
      lastMessage: 'Conversation démarrée',
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      unreadCount: 0,
      partner: partnerDetails || {
        id: tutorUserId,
        name: 'Tuteur EduLoc',
        email: '',
        role: 'TUTEUR',
        avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=250'
      }
    };

    storedConvs.unshift(newConv);
    saveStoredConversations(storedConvs);
    return newConv;
  },

  getMessages: async (conversationId: string): Promise<Message[]> => {
    try {
      const msgs = await request<any[]>(`/chat/conversations/${conversationId}/messages`);
      if (Array.isArray(msgs) && msgs.length > 0) {
        return msgs.map(m => ({
          id: m.id,
          conversationId: m.conversationId,
          senderId: m.senderId,
          content: m.content,
          timestamp: new Date(m.createdAt || Date.now()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          attachmentUrl: m.attachmentUrl,
          isJoinSessionButton: m.isJoinSessionButton
        }));
      }
    } catch {
      // Fallback
    }

    const allMsgs = getStoredMessages();
    return allMsgs.filter(m => m.conversationId === conversationId);
  },

  sendMessage: async (
    conversationId: string,
    content: string,
    options?: { attachmentUrl?: string; isJoinSessionButton?: boolean; senderId?: string }
  ): Promise<Message> => {
    const { attachmentUrl, isJoinSessionButton, senderId } = options ?? {};
    const bodyObj = {
      content,
      attachmentUrl,
      isJoinSessionButton,
    };

    try {
      const result = await request<any>(`/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: JSON.stringify(bodyObj),
      });
      if (result && result.id) {
        return {
          id: result.id,
          conversationId: result.conversationId,
          senderId: result.senderId,
          content: result.content,
          timestamp: new Date(result.createdAt || Date.now()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          attachmentUrl: result.attachmentUrl,
          isJoinSessionButton: result.isJoinSessionButton
        };
      }
    } catch {
      // Fallback
    }

    const newMsg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      conversationId,
      senderId: senderId || 'user-app-1',
      content,
      timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      attachmentUrl,
      isJoinSessionButton
    };

    const allMsgs = getStoredMessages();
    allMsgs.push(newMsg);
    saveStoredMessages(allMsgs);

    // Update conversation lastMessage in stored conversations
    const convs = getStoredConversations();
    const conv = convs.find(c => c.id === conversationId);
    if (conv) {
      conv.lastMessage = content;
      conv.lastSenderId = newMsg.senderId;
      conv.timestamp = newMsg.timestamp;
      saveStoredConversations(convs);
    }

    return newMsg;
  },

  submitBookingReview: async (
    bookingId: string,
    rating: number,
    comment: string,
    tags: string[]
  ): Promise<boolean> => {
    try {
      await request<any>(`/bookings/${bookingId}/review`, {
        method: 'POST',
        body: JSON.stringify({ rating, comment, tags }),
      });
    } catch (err) {
      // Fallback
    }

    const current = getStoredBookings();
    const updated = current.map(b => {
      if (b.id === bookingId) {
        return {
          ...b,
          reviewRating: rating,
          reviewComment: comment,
          reviewTags: tags,
          reviewedAt: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
        };
      }
      return b;
    });
    saveStoredBookings(updated);

    const targetBooking = current.find(b => b.id === bookingId);
    if (targetBooking) {
      try {
        await apiService.rateTutor(
          targetBooking.tutorProfile?.id || targetBooking.tutorId,
          targetBooking.apprenticeId,
          rating,
          comment,
          tags
        );
      } catch (e) {
        // Fallback
      }
    }

    window.dispatchEvent(new CustomEvent('eduloc_booking_updated', { detail: { bookingId, rating, comment } }));
    return true;
  },

  rateTutor: async (tutorId: string, apprenticeId: string, rating: number, text: string, tags: string[]): Promise<Review> => {
    let result: any = null;
    try {
      result = await request<any>('/reviews', {
        method: 'POST',
        body: JSON.stringify({ tutorId, apprenticeId, rating, text, tags }),
      });
    } catch (err) {
      // Fallback
    }

    const newRev: Review = {
      id: result?.id || `rev-${Date.now()}`,
      tutorId: result?.tutorId || tutorId,
      apprenticeId: result?.apprenticeId || apprenticeId,
      apprenticeName: result?.apprentice?.name || 'Apprenti',
      apprenticeAvatar: result?.apprentice?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      rating: result?.rating || rating,
      text: result?.text || text,
      timestamp: 'À l\'instant',
      officialReply: result?.officialReply
    };

    const current = getStoredReviews();
    saveStoredReviews([newRev, ...current]);
    window.dispatchEvent(new CustomEvent('eduloc_review_updated', { detail: newRev }));
    return newRev;
  },

  replyToReview: async (reviewId: string, replyText: string): Promise<Review | null> => {
    let result: any = null;
    try {
      result = await request<any>(`/reviews/${reviewId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ replyText }),
      });
    } catch (err) {
      console.warn('[API] POST /reviews/:id/reply request note:', err);
    }

    const current = getStoredReviews();
    let updatedReview: Review | null = null;
    const updated = current.map(r => {
      if (r.id === reviewId) {
        updatedReview = {
          ...r,
          officialReply: result?.officialReply || replyText
        };
        return updatedReview;
      }
      return r;
    });

    if (!updatedReview) {
      updatedReview = {
        id: reviewId,
        tutorId: 'tutor-prof-1',
        apprenticeId: 'user-app-1',
        apprenticeName: result?.apprentice?.name || 'Apprenti',
        apprenticeAvatar: result?.apprentice?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        rating: result?.rating || 5,
        text: result?.text || '',
        timestamp: 'À l\'instant',
        officialReply: result?.officialReply || replyText
      };
      updated.unshift(updatedReview);
    }

    saveStoredReviews(updated);
    window.dispatchEvent(new CustomEvent('eduloc_review_updated', { detail: updatedReview }));
    return updatedReview;
  },

  // --- STATS / METRICS FOR TUTOR ---

  getTutorAnalytics: async () => {
    return await request<any>('/tutors/me/analytics');
  },

  updateTutorSubjects: async (newSubjects: string[]): Promise<boolean> => {
    try {
      await request<any>('/tutors/me', {
        method: 'PATCH',
        body: JSON.stringify({ subjects: newSubjects }),
      });
      return true;
    } catch (e) {
      console.warn('[API] updateTutorSubjects request failed:', e);
      return false;
    }
  },

  updateTutorProfile: async (data: { bio?: string; subjects?: string[] }): Promise<boolean> => {
    try {
      await request<any>('/tutors/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return true;
    } catch (e) {
      console.warn('[API] updateTutorProfile request failed:', e);
      return false;
    }
  },

  // --- OFFERS CRUD FOR TUTOR ---

  getTutorOffers: async () => {
    try {
      const res = await request<any[]>('/tutors/me/offers');
      if (Array.isArray(res)) {
        return res.map(o => ({
          id: String(o.id),
          title: o.title,
          category: o.subject || o.category || 'Matière',
          description: o.description || '',
          price: Number(o.rate || o.price || 30),
          radius: Number(o.radius || 10),
          location: o.location || 'Sorbonne, Paris 5e',
          status: (o.isActive === true || o.status === 'Actif') ? 'Actif' : ('En attente' as 'Actif' | 'En attente')
        }));
      }
    } catch (e) {
      console.warn('[API] getTutorOffers request failed:', e);
    }
    return null;
  },

  getPublicTutorOffers: async (tutorId: string): Promise<OfferData[]> => {
    try {
      const res = await request<any[]>(`/tutors/${tutorId}/offers`);
      if (Array.isArray(res) && res.length > 0) {
        return res.map(o => ({
          id: String(o.id),
          title: o.title || `Cours de ${o.subject || o.category || 'Soutien'}`,
          category: o.subject || o.category || 'Matière',
          description: o.description || '',
          price: Number(o.rate || o.price || 30),
          radius: Number(o.radius || 10),
          location: o.location || 'Sorbonne, Paris 5e',
          status: (o.isActive === true || o.status === 'Actif') ? 'Actif' : ('En attente' as 'Actif' | 'En attente')
        }));
      }
    } catch (e) {
      console.warn('[API] getPublicTutorOffers request failed:', e);
    }
    return [];
  },

  createTutorOffer: async (offerData: { title: string; category: string; description: string; price: number; radius?: number; location?: string; status?: 'Actif' | 'En attente' }) => {
    try {
      const res = await request<any>('/tutors/me/offers', {
        method: 'POST',
        body: JSON.stringify({
          title: offerData.title,
          subject: offerData.category,
          rate: offerData.price,
          description: offerData.description,
          isActive: offerData.status === 'Actif'
        })
      });
      if (res && res.id) {
        return {
          id: String(res.id),
          title: res.title || offerData.title,
          category: res.subject || res.category || offerData.category,
          description: res.description || offerData.description,
          price: Number(res.rate || res.price || offerData.price),
          radius: Number(res.radius || offerData.radius || 10),
          location: res.location || offerData.location || 'Sorbonne, Paris 5e',
          status: (res.isActive === true || res.status === 'Actif') ? 'Actif' : ('En attente' as 'Actif' | 'En attente')
        };
      }
    } catch (e) {
      console.warn('[API] createTutorOffer request failed:', e);
    }
    return null;
  },

  updateTutorOffer: async (id: string, offerData: Partial<{ title: string; category: string; description: string; price: number; radius?: number; location?: string; status?: 'Actif' | 'En attente' }>) => {
    try {
      const bodyPayload: any = {};
      if (offerData.title !== undefined) bodyPayload.title = offerData.title;
      if (offerData.category !== undefined) bodyPayload.subject = offerData.category;
      if (offerData.price !== undefined) bodyPayload.rate = offerData.price;
      if (offerData.description !== undefined) bodyPayload.description = offerData.description;
      if (offerData.status !== undefined) bodyPayload.isActive = offerData.status === 'Actif';

      const res = await request<any>(`/tutors/me/offers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(bodyPayload)
      });
      if (res) {
        return {
          id: String(res.id || id),
          title: res.title || offerData.title || '',
          category: res.subject || res.category || offerData.category || '',
          description: res.description || offerData.description || '',
          price: Number(res.rate || res.price || offerData.price || 30),
          radius: Number(res.radius || offerData.radius || 10),
          location: res.location || offerData.location || 'Sorbonne, Paris 5e',
          status: (res.isActive === true || res.status === 'Actif') ? 'Actif' : ('En attente' as 'Actif' | 'En attente')
        };
      }
    } catch (e) {
      console.warn('[API] updateTutorOffer request failed:', e);
    }
    return null;
  },

  deleteTutorOffer: async (id: string): Promise<boolean> => {
    try {
      await request<any>(`/tutors/me/offers/${id}`, {
        method: 'DELETE'
      });
      return true;
    } catch (e) {
      console.warn('[API] deleteTutorOffer request failed:', e);
      return false;
    }
  },

  // --- SLOT ALERTS & NOTIFICATIONS ---

  subscribeSlotAlert: async (tutorId: string, date: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await request<any>('/slot-alerts', {
        method: 'POST',
        body: JSON.stringify({ tutorId, date }),
      });
      return res || { success: true };
    } catch (err) {
      console.warn('[API] POST /slot-alerts failed, using fallback:', err);
      return { success: true };
    }
  },

  // --- USER LANGUAGE SETTING ---

  updateUserLanguage: async (language: string): Promise<boolean> => {
    // No point hitting the API before the user is authenticated - the
    // preference is already saved to localStorage by the caller.
    if (!getAccessToken()) {
      return true;
    }
    try {
      await request<any>('/users/me/language', {
        method: 'PATCH',
        body: JSON.stringify({ language }),
      });
      return true;
    } catch (err) {
      console.warn('[API] PATCH /users/me/language failed, stored locally:', err);
      return true;
    }
  }
};
