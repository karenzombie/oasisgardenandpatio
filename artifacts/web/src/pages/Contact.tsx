import { MapPin, Clock, Phone, Mail } from "lucide-react";

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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 max-w-6xl mx-auto items-start">
          
          {/* Info Section */}
          <div className="space-y-12">
            <div className="bg-secondary p-8 md:p-10 border border-border">
              <h2 className="font-serif text-2xl mb-8">Showroom Information</h2>
              
              <div className="space-y-8">
                <div className="flex gap-4">
                  <div className="bg-background p-3 shrink-0 self-start">
                    <MapPin className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium text-lg mb-1">Address</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      21182 Centre Pointe Pkwy #100<br />
                      Santa Clarita, CA 91350
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="bg-background p-3 shrink-0 self-start">
                    <Clock className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium text-lg mb-1">Hours</h3>
                    <div className="text-muted-foreground leading-relaxed space-y-1">
                      <p className="flex justify-between w-64"><span>Sunday – Saturday (DST)</span> <span>10:00am – 6:00pm</span></p>
                      <p className="flex justify-between w-64"><span>Sunday – Saturday (PST)</span> <span>10:00am – 5:00pm</span></p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="bg-background p-3 shrink-0 self-start">
                    <Phone className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium text-lg mb-1">Phone</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      <a href="tel:6612559909" className="hover:text-primary transition-colors">(661) 255-9909</a>
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="bg-background p-3 shrink-0 self-start">
                    <Mail className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium text-lg mb-1">Email</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      <a href="mailto:sales@oasisgardenandpatio.com" className="hover:text-primary transition-colors break-all">sales@oasisgardenandpatio.com</a>
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
          </div>

          {/* Map Section */}
          <div className="h-[600px] bg-muted w-full relative border border-border">
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
        </div>
      </div>
    </div>
  );
}
