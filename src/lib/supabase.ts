import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client with service role key to bypass RLS when needed
export const supabaseAdmin = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : supabase; // Fallback to regular client if service key not available

// Auth helpers
export const signUp = async (email: string, password: string, fullName?: string) => {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError) {
    return { data: null, error: authError };
  }

  // Create app_users record
  if (authData.user) {
    const { data: appUserData, error: appUserError } = await supabase
      .from('app_users')
      .insert([{
        id: authData.user.id,
        email: email,
        display_name: fullName,
        is_admin: false
      }])
      .select()
      .single();

    if (appUserError) {
      console.error('Error creating app user:', appUserError);
      return { data: authData, error: appUserError };
    }
  }

  return { data: authData, error: null };
};

export const signIn = async (email: string, password: string) => {
  try {
    // Query app_users table directly for email and password match
    const { data: appUser, error: queryError } = await supabase
      .from('app_users')
      .select('*')
      .eq('email', email)
      .eq('password', password)
      .single();

    if (queryError || !appUser) {
      console.error('Login failed - user not found or wrong credentials:', queryError);
      return { data: null, error: { message: 'Invalid email or password' } };
    }

    console.log('Login successful for user:', appUser.email);
    
    // Try to sign in with Supabase Auth using dummy password
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: 'dummy-password-' + appUser.id,
      });

      if (authError) {
        // If auth user doesn't exist, create it
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password: 'dummy-password-' + appUser.id,
        });

        if (signUpError) {
          console.error('Failed to create auth user:', signUpError);
          return { data: null, error: signUpError };
        }

        return { data: signUpData, error: null };
      }

      return { data: authData, error: null };
    } catch (authError) {
      console.error('Auth error:', authError);
      // Even if auth fails, we validated the credentials, so return success
      return { data: { user: { id: appUser.id, email: appUser.email } }, error: null };
    }
  } catch (error: any) {
    console.error('Sign in error:', error);
    return { data: null, error };
  }
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  return { error };
};

export const getCurrentUser = async () => {
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !authUser) {
    return { user: null, error: authError };
  }

  // Get app_users record
  const { data: appUser, error: appUserError } = await supabase
    .from('app_users')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (appUserError) {
    console.error('Error fetching app user:', appUserError);
    return { user: null, error: appUserError };
  }

  return { user: appUser, error: null };
};

// Admin functions
export const createUserByAdmin = async (email: string, password: string, displayName: string, isAdmin: boolean) => {
  try {
    // First create the auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: 'dummy-password-' + Date.now(), // Dummy password for auth
    });

    if (authError) {
      return { data: null, error: authError };
    }

    // Create app_users record with actual password
    const { data: appUserData, error: appUserError } = await supabase
      .from('app_users')
      .insert([{
        id: authData.user?.id,
        email: email,
        display_name: displayName,
        password: password,
        is_admin: isAdmin
      }])
      .select()
      .single();

    if (appUserError) {
      console.error('Error creating app user:', appUserError);
      return { data: null, error: appUserError };
    }

    return { data: appUserData, error: null };
  } catch (error: any) {
    return { data: null, error };
  }
};

export const getAllUsers = async () => {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('id, email, display_name, is_admin, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error getting users:', error);
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error in getAllUsers:', error);
    return { data: null, error };
  }
};

export const updateUserByAdmin = async (userId: string, updates: { display_name?: string; is_admin?: boolean; password?: string }) => {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating user:', error);
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error in updateUserByAdmin:', error);
    return { data: null, error };
  }
};

export const deleteUserByAdmin = async (userId: string) => {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .delete()
      .eq('id', userId);

    if (error) {
      console.error('Error deleting user:', error);
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error in deleteUserByAdmin:', error);
    return { data: null, error };
  }
};
// Project management
export const getOrCreateDefaultProject = async (userId: string, userEmail: string) => {
  try {
    // Check if user is a member of any project
    const { data: membershipData, error: membershipError } = await supabase
      .from('project_members')
      .select('project_id, role')
      .eq('user_id', userId)
      .limit(1);

    if (membershipError) {
      console.error('Error checking project membership:', membershipError);
      throw membershipError;
    }

    // If user is member of a project, return that project ID
    if (membershipData && membershipData.length > 0) {
      return membershipData[0].project_id;
    }

    // Generate a new project ID (since we don't have a projects table)
    const newProjectId = crypto.randomUUID();

    // Add user as owner of the new project  
    const { error: memberError } = await supabase
      .from('project_members')
      .insert({
        project_id: newProjectId,
        user_id: userId,
        role: 'owner'
      });

    if (memberError) {
      console.error('Error adding user as project member:', memberError);
      throw memberError;
    }

    return newProjectId;
  } catch (error) {
    console.error('Error in getOrCreateDefaultProject:', error);
    throw error;
  }
};

// Chat helpers
export const createChatThread = async (projectId: string, title: string, authorEmail: string) => {
  try {
    // Get current user to set author_id
    const { user: currentUser } = await getCurrentUser();
    
    const { data, error } = await supabase
      .from('chat_items')
      .insert([{
        type: 'thread',
        project_id: projectId,
        title: title,
        author_ref: authorEmail,
        author_id: currentUser?.id || null,
        participants: [authorEmail],
        message_count: 0,
        last_message_at: new Date().toISOString(),
        status: 'active'
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating chat thread:', error);
      throw error;
    }

    return { data: data.id, error: null };
  } catch (error) {
    console.error('Error in createChatThread:', error);
    return { data: null, error };
  }
};

export const sendMessage = async (
  projectId: string,
  threadId: string,
  content: string,
  role: 'user' | 'assistant' = 'user',
  authorEmail: string,
  existingHistory?: any[]
) => {
  try {
    // Get current chat history
    const { data: threadData, error: fetchError } = await supabase
      .from('chat_items')
      .select('chat_history, message_count')
      .eq('id', threadId)
      .eq('type', 'thread')
      .single();

    if (fetchError) {
      console.error('Error fetching thread:', fetchError);
      throw fetchError;
    }

    // Get existing chat history or initialize empty array
    const currentHistory = threadData?.chat_history || [];
    
    // Create new message object
    const newMessage = {
      id: Date.now().toString(),
      role: role,
      content: content,
      author_ref: authorEmail,
      timestamp: new Date().toISOString()
    };

    // Add new message to history
    const updatedHistory = [...currentHistory, newMessage];

    // Update thread with new message in chat_history
    const currentCount = threadData?.message_count || 0;
    const { data, error } = await supabase
      .from('chat_items')
      .update({
        chat_history: updatedHistory,
        message_count: currentCount + 1,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', threadId)
      .eq('type', 'thread')
      .select()
      .single();

    if (error) {
      console.error('Error updating thread with message:', error);
      throw error;
    }

    return { data: newMessage.id, error: null };
  } catch (error) {
    console.error('Error in sendMessage:', error);
    return { data: null, error };
  }
};

export const getChatThreads = async (projectId: string) => {
  try {
    const { data, error } = await supabase
      .from('chat_items')
      .select('id, title, message_count, last_message_at, created_at')
      .eq('type', 'thread')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('last_message_at', { ascending: false });

    if (error) {
      console.error('Error getting chat threads:', error);
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error in getChatThreads:', error);
    return { data: null, error };
  }
};

export const getChatMessages = async (threadId: string) => {
  try {
    const { data: threadData, error } = await supabase
      .from('chat_items')
      .select('chat_history')
      .eq('id', threadId)
      .eq('type', 'thread')
      .single();

    if (error) {
      console.error('Error getting chat messages:', error);
      throw error;
    }

    // Return the chat_history array, or empty array if none
    const messages = threadData?.chat_history || [];
    return { data: messages, error: null };
  } catch (error) {
    console.error('Error in getChatMessages:', error);
    return { data: null, error };
  }
};

// Document helpers
export const createDocument = async (
  content: string,
  metadata: Record<string, any> = {}
) => {
  try {
    const { data, error } = await supabase
      .from('documents')
      .insert([{
        content,
        metadata
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating document:', error);
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error in createDocument:', error);
    return { data: null, error };
  }
};

export const updateDocument = async (
  id: string,
  content?: string,
  metadata?: Record<string, any>
) => {
  try {
    const updates: any = {};
    if (content !== undefined) updates.content = content;
    if (metadata !== undefined) {
      // If metadata is a string, try to parse it first
      if (typeof metadata === 'string') {
        try {
          updates.metadata = JSON.parse(metadata);
        } catch (e) {
          throw new Error('Invalid JSON format in metadata');
        }
      } else {
        updates.metadata = metadata;
      }
    }

    let query = supabase
      .from('documents')
      .update(updates)
      .eq('id', id);

    const { data, error } = await query
      .select()
      .single();

    if (error) {
      console.error('Error updating document:', error);
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error in updateDocument:', error);
    return { data: null, error };
  }
};

export const deleteDocument = async (id: string) => {
  try {
    const { data, error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting document:', error);
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error in deleteDocument:', error);
    return { data: null, error };
  }
};

export const getDocuments = async () => {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('*');

    if (error) {
      console.error('Error getting documents:', error);
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error in getDocuments:', error);
    return { data: null, error };
  }
};