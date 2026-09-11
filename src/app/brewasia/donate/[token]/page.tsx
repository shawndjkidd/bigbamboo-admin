import DonateForm from '../DonateForm'

// A brewery's private link: loads what they sent before and lets them change it.
export default function BreweryDonatePage({ params }: { params: { token: string } }) {
  return <DonateForm token={params.token} />
}
