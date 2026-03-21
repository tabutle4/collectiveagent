'use client'

type Props = {
  agent: any
  campaignResponse: any
  onClose: () => void
}

export default function AgentCampaignResponseModal({ agent, campaignResponse, onClose }: Props) {
  const profileUpdates = campaignResponse?.profile_updates || {}
  const commissionPlanLabels: Record<string, string> = {
    no_cap_plan: 'No Cap Plan 85/15',
    cap_plan: 'Cap Plan 70/30 $18,000 Cap',
    no_change: 'No Change',
    new_agent_plan: 'New Agent Plan',
    other: 'Other',
  }

  const workPreferenceLabels: Record<string, string> = {
    team: 'Team',
    independent: 'Independent',
    not_sure: 'Not Sure',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-4xl max-h-[90vh] rounded-lg shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-luxury-gray-5">
          <div>
            <h3 className="text-2xl font-light tracking-wide">Campaign Responses</h3>
            <p className="text-sm text-luxury-gray-2 mt-1">
              {agent.preferred_first_name} {agent.preferred_last_name} ({agent.email})
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-luxury-gray-3 hover:text-luxury-black text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-6">
            {/* Profile Updates Section */}
            {Object.keys(profileUpdates).length > 0 && (
              <div>
                <h4 className="text-lg font-medium mb-4 tracking-wide border-b border-luxury-gray-5 pb-2">
                  Profile Updates (Step 2)
                </h4>
                <div className="grid md:grid-cols-2 gap-4">
                  {profileUpdates.first_name && (
                    <div>
                      <label className="text-xs text-luxury-gray-2">First Name</label>
                      <p className="text-sm">{profileUpdates.first_name}</p>
                    </div>
                  )}
                  {profileUpdates.last_name && (
                    <div>
                      <label className="text-xs text-luxury-gray-2">Last Name</label>
                      <p className="text-sm">{profileUpdates.last_name}</p>
                    </div>
                  )}
                  {profileUpdates.preferred_first_name && (
                    <div>
                      <label className="text-xs text-luxury-gray-2">Preferred First Name</label>
                      <p className="text-sm">{profileUpdates.preferred_first_name}</p>
                    </div>
                  )}
                  {profileUpdates.preferred_last_name && (
                    <div>
                      <label className="text-xs text-luxury-gray-2">Preferred Last Name</label>
                      <p className="text-sm">{profileUpdates.preferred_last_name}</p>
                    </div>
                  )}
                  {profileUpdates.personal_email && (
                    <div>
                      <label className="text-xs text-luxury-gray-2">Personal Email</label>
                      <p className="text-sm">{profileUpdates.personal_email}</p>
                    </div>
                  )}
                  {profileUpdates.personal_phone && (
                    <div>
                      <label className="text-xs text-luxury-gray-2">Personal Phone</label>
                      <p className="text-sm">{profileUpdates.personal_phone}</p>
                    </div>
                  )}
                  {profileUpdates.business_phone && (
                    <div>
                      <label className="text-xs text-luxury-gray-2">Business Phone</label>
                      <p className="text-sm">{profileUpdates.business_phone}</p>
                    </div>
                  )}
                  {profileUpdates.date_of_birth && (
                    <div>
                      <label className="text-xs text-luxury-gray-2">Date of Birth</label>
                      <p className="text-sm">
                        {new Date(profileUpdates.date_of_birth).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  {profileUpdates.birth_month && (
                    <div>
                      <label className="text-xs text-luxury-gray-2">Birth Month</label>
                      <p className="text-sm">{profileUpdates.birth_month}</p>
                    </div>
                  )}
                  {profileUpdates.shirt_type && (
                    <div>
                      <label className="text-xs text-luxury-gray-2">Shirt Type</label>
                      <p className="text-sm">{profileUpdates.shirt_type}</p>
                    </div>
                  )}
                  {profileUpdates.shirt_size && (
                    <div>
                      <label className="text-xs text-luxury-gray-2">Shirt Size</label>
                      <p className="text-sm">{profileUpdates.shirt_size}</p>
                    </div>
                  )}
                  {profileUpdates.shipping_address_line1 && (
                    <div className="md:col-span-2">
                      <label className="text-xs text-luxury-gray-2">Shipping Address</label>
                      <p className="text-sm">
                        {profileUpdates.shipping_address_line1}
                        {profileUpdates.shipping_address_line2 &&
                          `, ${profileUpdates.shipping_address_line2}`}
                        {profileUpdates.shipping_city && `, ${profileUpdates.shipping_city}`}
                        {profileUpdates.shipping_state && `, ${profileUpdates.shipping_state}`}
                        {profileUpdates.shipping_zip && ` ${profileUpdates.shipping_zip}`}
                      </p>
                    </div>
                  )}
                  {profileUpdates.instagram_handle && (
                    <div>
                      <label className="text-xs text-luxury-gray-2">Instagram</label>
                      <p className="text-sm">
                        <a
                          href={profileUpdates.instagram_handle}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-luxury-black hover:underline"
                        >
                          {profileUpdates.instagram_handle}
                        </a>
                      </p>
                    </div>
                  )}
                  {profileUpdates.tiktok_handle && (
                    <div>
                      <label className="text-xs text-luxury-gray-2">TikTok</label>
                      <p className="text-sm">
                        <a
                          href={profileUpdates.tiktok_handle}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-luxury-black hover:underline"
                        >
                          {profileUpdates.tiktok_handle}
                        </a>
                      </p>
                    </div>
                  )}
                  {profileUpdates.threads_handle && (
                    <div>
                      <label className="text-xs text-luxury-gray-2">Threads</label>
                      <p className="text-sm">
                        <a
                          href={profileUpdates.threads_handle}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-luxury-black hover:underline"
                        >
                          {profileUpdates.threads_handle}
                        </a>
                      </p>
                    </div>
                  )}
                  {profileUpdates.youtube_url && (
                    <div>
                      <label className="text-xs text-luxury-gray-2">YouTube</label>
                      <p className="text-sm">
                        <a
                          href={profileUpdates.youtube_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-luxury-black hover:underline"
                        >
                          {profileUpdates.youtube_url}
                        </a>
                      </p>
                    </div>
                  )}
                  {profileUpdates.linkedin_url && (
                    <div>
                      <label className="text-xs text-luxury-gray-2">LinkedIn</label>
                      <p className="text-sm">
                        <a
                          href={profileUpdates.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-luxury-black hover:underline"
                        >
                          {profileUpdates.linkedin_url}
                        </a>
                      </p>
                    </div>
                  )}
                  {profileUpdates.facebook_url && (
                    <div>
                      <label className="text-xs text-luxury-gray-2">Facebook</label>
                      <p className="text-sm">
                        <a
                          href={profileUpdates.facebook_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-luxury-black hover:underline"
                        >
                          {profileUpdates.facebook_url}
                        </a>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Commission Plan Section */}
            {campaignResponse?.commission_plan_2026 && (
              <div>
                <h4 className="text-lg font-medium mb-4 tracking-wide border-b border-luxury-gray-5 pb-2">
                  Commission Plan Selection
                </h4>
                <div>
                  <label className="text-xs text-luxury-gray-2">Selected Plan</label>
                  <p className="text-sm">
                    {commissionPlanLabels[campaignResponse.commission_plan_2026] ||
                      campaignResponse.commission_plan_2026}
                    {campaignResponse.commission_plan_2026 === 'other' &&
                      campaignResponse.commission_plan_2026_other && (
                        <span className="text-luxury-gray-2">
                          {' '}
                          - {campaignResponse.commission_plan_2026_other}
                        </span>
                      )}
                  </p>
                </div>
              </div>
            )}

            {/* RSVP Section */}
            {campaignResponse &&
              campaignResponse.attending_luncheon !== null &&
              campaignResponse.attending_luncheon !== undefined && (
                <div>
                  <h4 className="text-lg font-medium mb-4 tracking-wide border-b border-luxury-gray-5 pb-2">
                    Luncheon RSVP (Step 3)
                  </h4>
                  <div>
                    <label className="text-xs text-luxury-gray-2">Attending</label>
                    <p className="text-sm">
                      {campaignResponse.attending_luncheon ? '✓ Yes' : '✗ No'}
                    </p>
                  </div>
                  {campaignResponse.luncheon_comments && (
                    <div className="mt-3">
                      <label className="text-xs text-luxury-gray-2">Comments</label>
                      <p className="text-sm text-luxury-gray-1">
                        {campaignResponse.luncheon_comments}
                      </p>
                    </div>
                  )}
                </div>
              )}

            {/* Survey Section */}
            {campaignResponse &&
              (campaignResponse.support_rating || campaignResponse.work_preference) && (
                <div>
                  <h4 className="text-lg font-medium mb-4 tracking-wide border-b border-luxury-gray-5 pb-2">
                    Feedback Survey (Step 4)
                  </h4>
                  {campaignResponse.support_rating && (
                    <div className="mb-4">
                      <label className="text-xs text-luxury-gray-2">Support Rating</label>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-48 h-2 bg-luxury-gray-5 rounded">
                          <div
                            className="h-full bg-luxury-accent rounded"
                            style={{ width: `${(campaignResponse.support_rating / 10) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm">{campaignResponse.support_rating}/10</span>
                      </div>
                    </div>
                  )}
                  {campaignResponse.support_improvements && (
                    <div className="mb-4">
                      <label className="text-xs text-luxury-gray-2">Support Improvements</label>
                      <p className="text-sm text-luxury-gray-1 mt-1">
                        {campaignResponse.support_improvements}
                      </p>
                    </div>
                  )}
                  {campaignResponse.work_preference && (
                    <div>
                      <label className="text-xs text-luxury-gray-2">Work Preference</label>
                      <p className="text-sm">
                        {workPreferenceLabels[campaignResponse.work_preference] ||
                          campaignResponse.work_preference}
                      </p>
                    </div>
                  )}
                </div>
              )}

            {(!campaignResponse ||
              (Object.keys(profileUpdates).length === 0 &&
                !campaignResponse.commission_plan_2026 &&
                (campaignResponse.attending_luncheon === null ||
                  campaignResponse.attending_luncheon === undefined) &&
                !campaignResponse.support_rating &&
                !campaignResponse.work_preference)) && (
              <p className="text-luxury-gray-2 text-center py-8">No responses submitted yet</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-luxury-gray-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded transition-colors text-center btn-primary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
