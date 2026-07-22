// Maps what the intake forms capture to a processing-fee-type code - the value
// stored in transactions.transaction_type. The forms cover the common cases; the
// land / commercial / business buyer-seller variants, landlord_apt_v2,
// commercial_landlord_v2, and tenant_commercial_v2 are picked by the office on the
// deal and are never produced here. transaction_type must always be a fee code,
// never 'lease' or 'sale'.

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
    case 'landlord':
      return 'landlord_v2'
    case 'referred_out':
      return 'referred_out_v2'
    case 'tenant':
      switch (tenantTransactionType) {
        case 'apartment':
          return 'tenant_apt_v2'
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
