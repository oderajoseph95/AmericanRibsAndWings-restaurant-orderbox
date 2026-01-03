import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Flame, Clock, Award, Heart, Truck, Users } from "lucide-react";

const features = [
  {
    icon: Flame,
    title: "Slow-Smoked",
    description: "Our ribs are smoked for hours to achieve that perfect fall-off-the-bone tenderness.",
  },
  {
    icon: Award,
    title: "Premium Quality",
    description: "We source only the finest cuts and freshest ingredients for our dishes.",
  },
  {
    icon: Heart,
    title: "Made with Love",
    description: "Every dish is prepared with passion and attention to detail.",
  },
  {
    icon: Clock,
    title: "Fast Service",
    description: "Quick preparation without compromising on quality or taste.",
  },
  {
    icon: Truck,
    title: "Delivery Available",
    description: "Enjoy our BBQ at home with our reliable delivery service.",
  },
  {
    icon: Users,
    title: "Group Orders",
    description: "Perfect for parties, events, and family gatherings.",
  },
];

export function About() {
  return (
    <section className="py-20 bg-background">
      <div className="container px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left side - Story */}
          <div>
            <Badge variant="secondary" className="mb-4">
              Our Story
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              Authentic American
              <span className="text-primary"> BBQ Experience</span>
            </h2>
            <div className="space-y-4 text-muted-foreground">
              <p className="text-lg">
                Welcome to American Ribs & Wings, where we bring the authentic taste 
                of American BBQ right to your table. Our journey started with a simple 
                passion: to serve the most delicious, tender ribs and crispy wings 
                you've ever tasted.
              </p>
              <p>
                We slow-smoke our meats using traditional techniques, combined with 
                our signature blend of spices and homemade sauces. Each bite is a 
                testament to our commitment to quality and flavor.
              </p>
              <p>
                Whether you're dining in, picking up, or ordering delivery, we promise 
                an unforgettable BBQ experience that'll keep you coming back for more.
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-6 mt-8">
              <div className="text-center">
                <div className="text-4xl font-bold text-primary">5+</div>
                <div className="text-sm text-muted-foreground">Years of Experience</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-primary">50+</div>
                <div className="text-sm text-muted-foreground">Menu Items</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-primary">10K+</div>
                <div className="text-sm text-muted-foreground">Happy Customers</div>
              </div>
            </div>
          </div>

          {/* Right side - Features grid */}
          <div className="grid grid-cols-2 gap-4">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className="border-border/50 hover:border-primary/50 hover:shadow-md transition-all duration-300"
              >
                <CardContent className="p-5">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
