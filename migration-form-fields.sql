-- Migration: Extract all form fields from code and populate form_config
-- This migration updates the form_config JSON for Just Listed, Pre-Listing, and Prospective Agent forms
-- with complete field definitions extracted from the actual form components.

-- =====================================================
-- 1. UPDATE Just Listed Form
-- =====================================================
UPDATE forms
SET form_config = jsonb_build_object(
  'fields', jsonb_build_array(
    -- Submission Type
    jsonb_build_object(
      'id', 'submission_type',
      'name', 'submission_type',
      'label', 'Is this a new submission or an update to an existing transaction?',
      'type', 'radio',
      'required', true,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'new', 'label', 'New Submission'),
        jsonb_build_object('value', 'update', 'label', 'Update Existing Transaction')
      )
    ),
    -- Agent (Co-Listing Agent selector)
    jsonb_build_object(
      'id', 'co_listing_agent',
      'name', 'co_listing_agent',
      'label', 'Agent',
      'type', 'co-listing-agent',
      'required', true,
      'placeholder', 'Type to search for an agent...'
    ),
    -- Property Address
    jsonb_build_object(
      'id', 'property_address',
      'name', 'property_address',
      'label', 'Property Address',
      'type', 'text',
      'required', true,
      'placeholder', '123 Main St, Houston, TX 77001'
    ),
    -- MLS Link
    jsonb_build_object(
      'id', 'mls_link',
      'name', 'mls_link',
      'label', 'MLS Link',
      'type', 'url',
      'required', true,
      'placeholder', 'https://...'
    ),
    -- Transaction Type (Who do you represent?)
    jsonb_build_object(
      'id', 'transaction_type',
      'name', 'transaction_type',
      'label', 'Who do you represent?',
      'type', 'select',
      'required', true,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'sale', 'label', 'Seller'),
        jsonb_build_object('value', 'lease', 'label', 'Landlord')
      )
    ),
    -- Client Names
    jsonb_build_object(
      'id', 'client_names',
      'name', 'client_names',
      'label', 'Client Name or LLC',
      'type', 'text',
      'required', true,
      'placeholder', 'John and Jane Doe or ABC LLC'
    ),
    -- Client Phone
    jsonb_build_object(
      'id', 'client_phone',
      'name', 'client_phone',
      'label', 'Client Phone Number(s)',
      'type', 'phone',
      'required', true,
      'placeholder', '(555) 123-4567'
    ),
    -- Client Email
    jsonb_build_object(
      'id', 'client_email',
      'name', 'client_email',
      'label', 'Client Email Address(es)',
      'type', 'email',
      'required', true,
      'placeholder', 'client@example.com'
    ),
    -- Coordination Requested (Checkbox)
    jsonb_build_object(
      'id', 'coordination_requested',
      'name', 'coordination_requested',
      'label', 'Request Listing Coordination',
      'type', 'checkbox',
      'required', false
    ),
    -- Coordination Payment Method (conditional)
    jsonb_build_object(
      'id', 'coordination_payment_method',
      'name', 'coordination_payment_method',
      'label', 'Who Pays?',
      'type', 'radio',
      'required', false,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'client_direct', 'label', 'Client Pays Directly (Before Service Starts)'),
        jsonb_build_object('value', 'agent_pays', 'label', 'Agent Pays (Before Service Starts)')
      ),
      'conditional', jsonb_build_object('field', 'coordination_requested', 'value', true)
    ),
    -- Coordination Payment Type (conditional)
    jsonb_build_object(
      'id', 'coordination_payment_type',
      'name', 'coordination_payment_type',
      'label', 'Payment Method',
      'type', 'radio',
      'required', false,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'zelle', 'label', 'Zelle'),
        jsonb_build_object('value', 'invoice', 'label', 'Invoice')
      ),
      'conditional', jsonb_build_object('field', 'coordination_requested', 'value', true)
    ),
    -- Dotloop File Created
    jsonb_build_object(
      'id', 'dotloop_file_created',
      'name', 'dotloop_file_created',
      'label', 'Dotloop file created with listing agreement and/or seller disclosure',
      'type', 'checkbox',
      'required', true
    ),
    -- Lead Source (optional, may not be in form but in data)
    jsonb_build_object(
      'id', 'lead_source',
      'name', 'lead_source',
      'label', 'Lead Source',
      'type', 'text',
      'required', false
    ),
    -- Is Broker Listing (optional, in state but not visible)
    jsonb_build_object(
      'id', 'is_broker_listing',
      'name', 'is_broker_listing',
      'label', 'Is Broker Listing',
      'type', 'checkbox',
      'required', false
    )
  ),
  'submissionType', true,
  'agentSelector', true
)
WHERE form_type = 'just-listed';

-- =====================================================
-- 2. UPDATE Pre-Listing Form
-- =====================================================
UPDATE forms
SET form_config = jsonb_build_object(
  'fields', jsonb_build_array(
    -- Submission Type
    jsonb_build_object(
      'id', 'submission_type',
      'name', 'submission_type',
      'label', 'Is this a new submission or an update to an existing transaction?',
      'type', 'radio',
      'required', true,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'new', 'label', 'New Submission'),
        jsonb_build_object('value', 'update', 'label', 'Update Existing Transaction')
      )
    ),
    -- Agent (Co-Listing Agent selector)
    jsonb_build_object(
      'id', 'co_listing_agent',
      'name', 'co_listing_agent',
      'label', 'Agent',
      'type', 'co-listing-agent',
      'required', true,
      'placeholder', 'Type to search for an agent...'
    ),
    -- Property Address
    jsonb_build_object(
      'id', 'property_address',
      'name', 'property_address',
      'label', 'Property Address',
      'type', 'text',
      'required', true,
      'placeholder', '123 Main St, Houston, TX 77001'
    ),
    -- Transaction Type
    jsonb_build_object(
      'id', 'transaction_type',
      'name', 'transaction_type',
      'label', 'Transaction Type',
      'type', 'select',
      'required', true,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'sale', 'label', 'Sale'),
        jsonb_build_object('value', 'lease', 'label', 'Lease')
      )
    ),
    -- Client Names
    jsonb_build_object(
      'id', 'client_names',
      'name', 'client_names',
      'label', 'Client Name or LLC',
      'type', 'text',
      'required', true,
      'placeholder', 'John and Jane Doe or ABC LLC'
    ),
    -- Client Phone
    jsonb_build_object(
      'id', 'client_phone',
      'name', 'client_phone',
      'label', 'Client Phone Number(s)',
      'type', 'phone',
      'required', true,
      'placeholder', '(555) 123-4567'
    ),
    -- Client Email
    jsonb_build_object(
      'id', 'client_email',
      'name', 'client_email',
      'label', 'Client Email Address(es)',
      'type', 'email',
      'required', true,
      'placeholder', 'client@example.com'
    ),
    -- Lead Source
    jsonb_build_object(
      'id', 'lead_source',
      'name', 'lead_source',
      'label', 'What is the source of this lead?',
      'type', 'select',
      'required', true,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'brokerage_referral', 'label', 'Brokerage Referral'),
        jsonb_build_object('value', 'client_referral', 'label', 'Client Referral'),
        jsonb_build_object('value', 'other_referral', 'label', 'Other Referral'),
        jsonb_build_object('value', 'kvcore_lead', 'label', 'kvCORE Lead'),
        jsonb_build_object('value', 'mls_lead', 'label', 'MLS Lead'),
        jsonb_build_object('value', 'ig_lead', 'label', 'IG Lead'),
        jsonb_build_object('value', 'repeat_client', 'label', 'Repeat Client'),
        jsonb_build_object('value', 'print_advertising', 'label', 'Print Advertising')
      )
    ),
    -- Estimated Launch Date
    jsonb_build_object(
      'id', 'estimated_launch_date',
      'name', 'estimated_launch_date',
      'label', 'Estimated Listing Launch Date',
      'type', 'date',
      'required', true
    ),
    -- Listing Input Requested
    jsonb_build_object(
      'id', 'listing_input_requested',
      'name', 'listing_input_requested',
      'label', 'Request Initial Listing Input - $50 (one time)',
      'type', 'checkbox',
      'required', false
    ),
    -- Listing Input Payment Method (conditional)
    jsonb_build_object(
      'id', 'listing_input_payment_method',
      'name', 'listing_input_payment_method',
      'label', 'Payment Method',
      'type', 'radio',
      'required', false,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'zelle', 'label', 'Zelle'),
        jsonb_build_object('value', 'invoice', 'label', 'Invoice')
      ),
      'conditional', jsonb_build_object('field', 'listing_input_requested', 'value', true)
    ),
    -- Coordination Requested
    jsonb_build_object(
      'id', 'coordination_requested',
      'name', 'coordination_requested',
      'label', 'Request Listing Coordination',
      'type', 'checkbox',
      'required', false
    ),
    -- Coordination Payment Method (conditional)
    jsonb_build_object(
      'id', 'coordination_payment_method',
      'name', 'coordination_payment_method',
      'label', 'Who Pays?',
      'type', 'radio',
      'required', false,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'client_direct', 'label', 'Client Pays Directly (Before Service Starts)'),
        jsonb_build_object('value', 'agent_pays', 'label', 'Agent Pays (Before Service Starts)')
      ),
      'conditional', jsonb_build_object('field', 'coordination_requested', 'value', true)
    ),
    -- Coordination Payment Type (conditional)
    jsonb_build_object(
      'id', 'coordination_payment_type',
      'name', 'coordination_payment_type',
      'label', 'Payment Method',
      'type', 'radio',
      'required', false,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'zelle', 'label', 'Zelle'),
        jsonb_build_object('value', 'invoice', 'label', 'Invoice')
      ),
      'conditional', jsonb_build_object('field', 'coordination_requested', 'value', true)
    ),
    -- Photography Requested (optional, in state but not visible)
    jsonb_build_object(
      'id', 'photography_requested',
      'name', 'photography_requested',
      'label', 'Photography Requested',
      'type', 'checkbox',
      'required', false
    ),
    -- Dotloop File Created
    jsonb_build_object(
      'id', 'dotloop_file_created',
      'name', 'dotloop_file_created',
      'label', 'I confirm the above steps have been completed',
      'type', 'checkbox',
      'required', true
    ),
    -- Is Broker Listing (optional, in state but not visible)
    jsonb_build_object(
      'id', 'is_broker_listing',
      'name', 'is_broker_listing',
      'label', 'Is Broker Listing',
      'type', 'checkbox',
      'required', false
    )
  ),
  'submissionType', true,
  'agentSelector', true
)
WHERE form_type = 'pre-listing';

-- =====================================================
-- 3. INSERT or UPDATE Prospective Agent Form
-- =====================================================
-- Use DO block to check if form exists, then INSERT or UPDATE
DO $$
DECLARE
  form_exists boolean;
BEGIN
  -- Check if form exists
  SELECT EXISTS(SELECT 1 FROM forms WHERE form_type = 'prospective-agent') INTO form_exists;
  
  IF NOT form_exists THEN
    -- Insert new form
    INSERT INTO forms (
      name,
      description,
      form_type,
      form_config,
      is_active,
      shareable_link_url,
      created_at,
      updated_at
    )
    VALUES (
      'Prospective Agent Form',
      'Public form for prospective agents to join the firm',
      'prospective-agent',
      jsonb_build_object(
        'fields', jsonb_build_array(
      -- First Name (Legal)
      jsonb_build_object(
        'id', 'first_name',
        'name', 'first_name',
        'label', 'First Name (Legal)',
        'type', 'text',
        'required', true
      ),
      -- Last Name (Legal)
      jsonb_build_object(
        'id', 'last_name',
        'name', 'last_name',
        'label', 'Last Name (Legal)',
        'type', 'text',
        'required', true
      ),
      -- Preferred First Name
      jsonb_build_object(
        'id', 'preferred_first_name',
        'name', 'preferred_first_name',
        'label', 'Preferred First Name',
        'type', 'text',
        'required', true,
        'placeholder', 'What you go by'
      ),
      -- Preferred Last Name
      jsonb_build_object(
        'id', 'preferred_last_name',
        'name', 'preferred_last_name',
        'label', 'Preferred Last Name',
        'type', 'text',
        'required', true,
        'placeholder', 'What you go by'
      ),
      -- Phone
      jsonb_build_object(
        'id', 'phone',
        'name', 'phone',
        'label', 'Phone (10 digits only)',
        'type', 'phone',
        'required', true,
        'validation', jsonb_build_object('pattern', '[0-9]{10}', 'maxLength', 10)
      ),
      -- Email
      jsonb_build_object(
        'id', 'email',
        'name', 'email',
        'label', 'Email',
        'type', 'email',
        'required', true
      ),
      -- Location
      jsonb_build_object(
        'id', 'location',
        'name', 'location',
        'label', 'Where are you located?',
        'type', 'radio',
        'required', true,
        'options', jsonb_build_array(
          jsonb_build_object('value', 'Houston, TX', 'label', 'Houston, TX'),
          jsonb_build_object('value', 'Dallas, TX', 'label', 'Dallas, TX'),
          jsonb_build_object('value', 'Other', 'label', 'Other')
        )
      ),
      -- Instagram Handle
      jsonb_build_object(
        'id', 'instagram_handle',
        'name', 'instagram_handle',
        'label', 'Instagram Handle',
        'type', 'text',
        'required', false,
        'placeholder', '@yourhandle'
      ),
      -- MLS Choice
      jsonb_build_object(
        'id', 'mls_choice',
        'name', 'mls_choice',
        'label', 'Which MLS will you join?',
        'type', 'radio',
        'required', true,
        'options', jsonb_build_array(
          jsonb_build_object('value', 'HAR', 'label', 'HAR'),
          jsonb_build_object('value', 'MetroTex | NTREIS', 'label', 'MetroTex | NTREIS'),
          jsonb_build_object('value', 'Both', 'label', 'Both')
        )
      ),
      -- Association Status
      jsonb_build_object(
        'id', 'association_status',
        'name', 'association_status',
        'label', 'Select option that describes your association status',
        'type', 'radio',
        'required', true,
        'options', jsonb_build_array(
          jsonb_build_object('value', 'new_agent', 'label', 'I am a brand new licensed agent'),
          jsonb_build_object('value', 'previous_member', 'label', 'I was previously a member of [selected MLS] with another brokerage')
        )
      ),
      -- Previous Brokerage (conditional)
      jsonb_build_object(
        'id', 'previous_brokerage',
        'name', 'previous_brokerage',
        'label', 'What was your previous brokerage?',
        'type', 'text',
        'required', false,
        'conditional', jsonb_build_object('field', 'association_status', 'value', 'previous_member')
      ),
      -- Expectations
      jsonb_build_object(
        'id', 'expectations',
        'name', 'expectations',
        'label', 'What expectations do you have for Collective Realty Co.?',
        'type', 'textarea',
        'required', true
      ),
      -- Accountability
      jsonb_build_object(
        'id', 'accountability',
        'name', 'accountability',
        'label', 'Do you want to be held accountable?',
        'type', 'textarea',
        'required', true
      ),
      -- Lead Generation
      jsonb_build_object(
        'id', 'lead_generation',
        'name', 'lead_generation',
        'label', 'How do you plan to produce business leads?',
        'type', 'textarea',
        'required', true
      ),
      -- Additional Info
      jsonb_build_object(
        'id', 'additional_info',
        'name', 'additional_info',
        'label', 'Is there anything you would like to add?',
        'type', 'textarea',
        'required', true
      ),
      -- How Heard
      jsonb_build_object(
        'id', 'how_heard',
        'name', 'how_heard',
        'label', 'How did you hear about us?',
        'type', 'select',
        'required', true,
        'options', jsonb_build_array(
          jsonb_build_object('value', 'Agent referral', 'label', 'Agent referral'),
          jsonb_build_object('value', 'Social media', 'label', 'Social media'),
          jsonb_build_object('value', 'Google search', 'label', 'Google search'),
          jsonb_build_object('value', 'Friend/family', 'label', 'Friend/family'),
          jsonb_build_object('value', 'Other', 'label', 'Other')
        )
      ),
      -- How Heard Other (conditional)
      jsonb_build_object(
        'id', 'how_heard_other',
        'name', 'how_heard_other',
        'label', 'If other, please describe:',
        'type', 'text',
        'required', false,
        'conditional', jsonb_build_object('field', 'how_heard', 'value', 'Other')
      ),
      -- Referring Agent
      jsonb_build_object(
        'id', 'referring_agent',
        'name', 'referring_agent',
        'label', 'If an agent referred you, please list their name below',
        'type', 'text',
        'required', false
      ),
      -- Joining Team
      jsonb_build_object(
        'id', 'joining_team',
        'name', 'joining_team',
        'label', 'Are you joining a team after onboarding? If so, please list the team name or team lead below',
        'type', 'text',
        'required', false
        )
      ),
      'submissionType', false,
      'agentSelector', false
    ),
    true,
    'https://agent.collectiverealtyco.com/prospective-agent-form',
    NOW(),
    NOW()
  );
  END IF;
END $$;

-- Update the form (works whether it exists or was just created)
UPDATE forms
SET form_config = jsonb_build_object(
  'fields', jsonb_build_array(
    -- First Name (Legal)
    jsonb_build_object(
      'id', 'first_name',
      'name', 'first_name',
      'label', 'First Name (Legal)',
      'type', 'text',
      'required', true
    ),
    -- Last Name (Legal)
    jsonb_build_object(
      'id', 'last_name',
      'name', 'last_name',
      'label', 'Last Name (Legal)',
      'type', 'text',
      'required', true
    ),
    -- Preferred First Name
    jsonb_build_object(
      'id', 'preferred_first_name',
      'name', 'preferred_first_name',
      'label', 'Preferred First Name',
      'type', 'text',
      'required', true,
      'placeholder', 'What you go by'
    ),
    -- Preferred Last Name
    jsonb_build_object(
      'id', 'preferred_last_name',
      'name', 'preferred_last_name',
      'label', 'Preferred Last Name',
      'type', 'text',
      'required', true,
      'placeholder', 'What you go by'
    ),
    -- Phone
    jsonb_build_object(
      'id', 'phone',
      'name', 'phone',
      'label', 'Phone (10 digits only)',
      'type', 'phone',
      'required', true,
      'validation', jsonb_build_object('pattern', '[0-9]{10}', 'maxLength', 10)
    ),
    -- Email
    jsonb_build_object(
      'id', 'email',
      'name', 'email',
      'label', 'Email',
      'type', 'email',
      'required', true
    ),
    -- Location
    jsonb_build_object(
      'id', 'location',
      'name', 'location',
      'label', 'Where are you located?',
      'type', 'radio',
      'required', true,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'Houston, TX', 'label', 'Houston, TX'),
        jsonb_build_object('value', 'Dallas, TX', 'label', 'Dallas, TX'),
        jsonb_build_object('value', 'Other', 'label', 'Other')
      )
    ),
    -- Instagram Handle
    jsonb_build_object(
      'id', 'instagram_handle',
      'name', 'instagram_handle',
      'label', 'Instagram Handle',
      'type', 'text',
      'required', false,
      'placeholder', '@yourhandle'
    ),
    -- MLS Choice
    jsonb_build_object(
      'id', 'mls_choice',
      'name', 'mls_choice',
      'label', 'Which MLS will you join?',
      'type', 'radio',
      'required', true,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'HAR', 'label', 'HAR'),
        jsonb_build_object('value', 'MetroTex | NTREIS', 'label', 'MetroTex | NTREIS'),
        jsonb_build_object('value', 'Both', 'label', 'Both')
      )
    ),
    -- Association Status
    jsonb_build_object(
      'id', 'association_status',
      'name', 'association_status',
      'label', 'Select option that describes your association status',
      'type', 'radio',
      'required', true,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'new_agent', 'label', 'I am a brand new licensed agent'),
        jsonb_build_object('value', 'previous_member', 'label', 'I was previously a member of [selected MLS] with another brokerage')
      )
    ),
    -- Previous Brokerage (conditional)
    jsonb_build_object(
      'id', 'previous_brokerage',
      'name', 'previous_brokerage',
      'label', 'What was your previous brokerage?',
      'type', 'text',
      'required', false,
      'conditional', jsonb_build_object('field', 'association_status', 'value', 'previous_member')
    ),
    -- Expectations
    jsonb_build_object(
      'id', 'expectations',
      'name', 'expectations',
      'label', 'What expectations do you have for Collective Realty Co.?',
      'type', 'textarea',
      'required', true
    ),
    -- Accountability
    jsonb_build_object(
      'id', 'accountability',
      'name', 'accountability',
      'label', 'Do you want to be held accountable?',
      'type', 'textarea',
      'required', true
    ),
    -- Lead Generation
    jsonb_build_object(
      'id', 'lead_generation',
      'name', 'lead_generation',
      'label', 'How do you plan to produce business leads?',
      'type', 'textarea',
      'required', true
    ),
    -- Additional Info
    jsonb_build_object(
      'id', 'additional_info',
      'name', 'additional_info',
      'label', 'Is there anything you would like to add?',
      'type', 'textarea',
      'required', true
    ),
    -- How Heard
    jsonb_build_object(
      'id', 'how_heard',
      'name', 'how_heard',
      'label', 'How did you hear about us?',
      'type', 'select',
      'required', true,
      'options', jsonb_build_array(
        jsonb_build_object('value', 'Agent referral', 'label', 'Agent referral'),
        jsonb_build_object('value', 'Social media', 'label', 'Social media'),
        jsonb_build_object('value', 'Google search', 'label', 'Google search'),
        jsonb_build_object('value', 'Friend/family', 'label', 'Friend/family'),
        jsonb_build_object('value', 'Other', 'label', 'Other')
      )
    ),
    -- How Heard Other (conditional)
    jsonb_build_object(
      'id', 'how_heard_other',
      'name', 'how_heard_other',
      'label', 'If other, please describe:',
      'type', 'text',
      'required', false,
      'conditional', jsonb_build_object('field', 'how_heard', 'value', 'Other')
    ),
    -- Referring Agent
    jsonb_build_object(
      'id', 'referring_agent',
      'name', 'referring_agent',
      'label', 'If an agent referred you, please list their name below',
      'type', 'text',
      'required', false
    ),
    -- Joining Team
    jsonb_build_object(
      'id', 'joining_team',
      'name', 'joining_team',
      'label', 'Are you joining a team after onboarding? If so, please list the team name or team lead below',
      'type', 'text',
      'required', false
    )
  ),
  'submissionType', false,
  'agentSelector', false
),
updated_at = NOW()
WHERE form_type = 'prospective-agent';

