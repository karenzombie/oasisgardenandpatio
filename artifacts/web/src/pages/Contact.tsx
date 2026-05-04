export default function Contact() {
  return (
    <div className="w-full bg-background">
      <div className="container mx-auto px-4 py-16 md:py-24">

        {/* Header */}
        <div className="max-w-2xl mx-auto text-center mb-16">
          <h1 className="font-serif text-4xl md:text-5xl font-medium mb-6">Visit Our Oasis</h1>
          <p className="text-lg text-muted-foreground">
            Experience our curated selection of luxury outdoor furniture in person. Our design experts are ready to help you create your perfect patio.
          </p>
        </div>

        {/* Map */}
        <div className="h-[500px] md:h-[600px] bg-muted w-full relative border border-border max-w-6xl mx-auto">
          <iframe
            src="https://maps.google.com/maps?q=21182+Centre+Pointe+Pkwy+%23100%2C+Santa+Clarita%2C+CA+91350&z=15&output=embed"
            width="100%"
            height="100%"
            style={{ border: 0 }}
            allowFullScreen={true}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="absolute inset-0 grayscale contrast-125 opacity-90"
            title="Oasis Garden & Patio Location Map"
          />
        </div>

        {/* Storefront Photos */}
        <div className="max-w-6xl mx-auto mt-16 grid grid-cols-1 md:grid-cols-2 gap-6">
          <img
            src="/storefront1.png"
            alt="Oasis Garden & Patio storefront entrance"
            className="w-full h-72 md:h-96 object-cover rounded-sm border border-border"
          />
          <img
            src="/storefront2.jpeg"
            alt="Oasis Garden & Patio building exterior"
            className="w-full h-72 md:h-96 object-cover rounded-sm border border-border"
          />
        </div>

      </div>
    </div>
  );
}
