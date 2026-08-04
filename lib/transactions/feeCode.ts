// Maps what the intake forms capture to a processing-fee-type code - the value
// stored in transactions.transaction_type. The compliance form now covers the
// commercial and business variants too, so the fee the agent attests to matches
// the fee the payout charges instead of the office reclassifying afterwards.
// The land buyer-seller variants are still picked by the office; they carry the
// same fee as their residential twins, so nothing drifts when they are.
// transaction_type must always be a fee code, never 'lease' or 'sale'.

export function feeCodeFromRepresenting(
  representing: string | null | undefined,
  tenantTransactionType?: string | null,
): string | null {
  switch (representing) {
    case 'buyer':
      return 'buyer_v2'
    case 'nc_buyer':
    case 'new_construction_buyer':
      return 'nc_buyer_v2'
    case 'seller':
      return 'seller_v2'
    case 'commercial_buyer':
      return 'commercial_buyer_v2'
    case 'commercial_seller':
      return 'commercial_seller_v2'
    case 'business_buyer':
      return 'business_buyer_v2'
    case 'business_seller':
      return 'business_seller_v2'
    case 'landlord':
      // The compliance form shows the same lease sub-type dropdown for tenant
      // and landlord, so a landlord answer resolves to the landlord variant of
      // whatever was picked. Previously every landlord deal became landlord_v2,
      // which quietly lost the apartment and commercial distinctions.
      switch (tenantTransactionType) {
        case 'apartment':
          return 'landlord_apt_v2'
        case 'commercial':
          return 'commercial_landlord_v2'
        default:
          return 'landlord_v2'
      }
    case 'referred_out':
      return 'referred_out_v2'
    case 'tenant':
      switch (tenantTransactionType) {
        case 'apartment':
          return 'tenant_apt_v2'
        case 'commercial':
          return 'tenant_commercial_v2'
        case 'tenant_non_apt_v2':
          return 'tenant_non_apt_v2'
        case 'tenant_simplyhome_v2':
          return 'tenant_simplyhome_v2'
        default:
          return 'tenant_apt_v2'
      }
    default:
      return null
  }
}

// The retainer form uses its own words (residential_buyer / residential_rental /
// commercial_rental) and creates an early prospect the office refines later.
export function feeCodeFromRetainerType(retainerType: string | null | undefined): string | null {
  switch (retainerType) {
    case 'residential_buyer':
      return 'buyer_v2'
    case 'residential_rental':
      return 'tenant_non_apt_v2'
    case 'commercial_rental':
      return 'tenant_commercial_v2'
    default:
      return null
  }
}
